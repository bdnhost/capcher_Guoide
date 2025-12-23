// AI Screen Recorder - Background Service Worker
// Updated for Manifest V3 using Offscreen Document
importScripts('logger.js');

let isRecording = false;
let isPaused = false;
let drawingTool = "pen";
let timerInterval = null;
let recordingStartTime = 0;
let accumulatedTime = 0; // Total time in milliseconds before the current segment

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug("Received message:", message);

  // Handle target filtering
  if (message.target && message.target !== "background") return;

  // Handle tool selection changes
  if (message.tool && !["undo", "redo", "clear"].includes(message.tool)) {
    drawingTool = message.tool;
    chrome.storage.local.set({ tool: drawingTool });
    broadcastToTabs({ tool: drawingTool });
    return true;
  }

  // Handle color changes
  if (message.color) {
    chrome.storage.local.set({ color: message.color });
    broadcastToTabs({ color: message.color });
    return true;
  }

  // Handle line width changes
  if (message.lineWidth) {
    chrome.storage.local.set({ lineWidth: message.lineWidth });
    broadcastToTabs({ lineWidth: message.lineWidth });
    return true;
  }

  // Handle start recording request
  if (message.type === "START_RECORD") {
    if (isRecording) {
      sendResponse({ error: "Already recording" });
      return true;
    }
    if (!message.streamId) {
      sendResponse({ error: "Missing streamId" });
      return true;
    }
    startRecordingProcess(message.streamId, sendResponse);
    return true;
  }

  // Handle stop recording request
  if (message.type === "STOP_RECORD") {
    stopRecordingFlow();
    return true;
  }

  // Handle pause recording request
  if (message.type === "PAUSE_RECORD") {
    chrome.runtime.sendMessage({ type: "PAUSE_RECORD", target: "offscreen" });
    isPaused = true;
    if (timerInterval) {
      clearInterval(timerInterval);
      accumulatedTime += Date.now() - recordingStartTime;
    }
    broadcastToTabs({ type: "RECORDING_PAUSED" });
    return true;
  }

  // Handle resume recording request
  if (message.type === "RESUME_RECORD") {
    chrome.runtime.sendMessage({ type: "RESUME_RECORD", target: "offscreen" });
    isPaused = false;
    if (isRecording) {
      recordingStartTime = Date.now();
      timerInterval = setInterval(() => {
        const totalElapsed = accumulatedTime + (Date.now() - recordingStartTime);
        const elapsedSec = Math.floor(totalElapsed / 1000);
        const minutes = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
        const seconds = (elapsedSec % 60).toString().padStart(2, '0');
        broadcastToTabs({ type: 'UPDATE_TIMER', time: `${minutes}:${seconds}` });
      }, 1000);
    }
    broadcastToTabs({ type: "RECORDING_RESUMED" });
    return true;
  }

  // Handle status requests
  if (message.type === "GET_STATUS") {
    sendResponse({
      isRecording: isRecording,
      isPaused: isPaused, // Added isPaused to status
      tool: drawingTool
    });
    return true;
  }

  // Forward tool commands
  if (["undo", "redo", "clear"].includes(message.tool)) {
    broadcastToTabs({ tool: message.tool });
    return;
  }

  // Handle SET_GOAL
  if (message.type === "SET_GOAL") {
    broadcastToTabs(message);
    return;
  }

  // Handle recording lifecycle messages from offscreen
  if (message.type === "RECORDING_STARTED") {
    isRecording = true;
    isPaused = false;
    accumulatedTime = 0;
    recordingStartTime = Date.now();
    timerInterval = setInterval(() => {
      const totalElapsed = accumulatedTime + (Date.now() - recordingStartTime);
      const elapsedSec = Math.floor(totalElapsed / 1000);
      const minutes = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const seconds = (elapsedSec % 60).toString().padStart(2, '0');
      broadcastToTabs({ type: 'UPDATE_TIMER', time: `${minutes}:${seconds}` });
    }, 1000);
    chrome.runtime.sendMessage({ type: "RECORDING_STARTED" });
    broadcastToTabs({ type: "RECORDING_STARTED" });
  }

  if (message.type === "RECORDING_COMPLETE") {
    isRecording = false;
    isPaused = false;
    clearInterval(timerInterval); // Stop timer
    broadcastToTabs({ type: 'UPDATE_TIMER', time: '00:00' }); // Reset timer display
    saveRecording(message.url);
    chrome.runtime.sendMessage({ type: "RECORDING_STOPPED" });
    broadcastToTabs({ type: "RECORDING_STOPPED" });
    closeOffscreenDocument();
  }

  if (message.type === "RECORDING_ERROR") {
    isRecording = false;
    isPaused = false;
    clearInterval(timerInterval); // Stop timer
    broadcastToTabs({ type: 'UPDATE_TIMER', time: '00:00' }); // Reset timer display
    chrome.runtime.sendMessage({ type: "RECORDING_ERROR", error: message.error });
    closeOffscreenDocument();
  }
});

function broadcastToTabs(msg) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => { });
      }
    });
  });
}

async function startRecordingProcess(streamId, sendResponse) {
  try {
    await setupOffscreenDocument('offscreen.html');

    const settings = await chrome.storage.local.get(['videoQuality', 'audioSource']);

    chrome.runtime.sendMessage({
      type: "START_RECORDING",
      target: "offscreen",
      streamId: streamId,
      settings: settings
    });

    sendResponse({ success: true });
    logger.info("Recording process started successfully");
  } catch (error) {
    logger.error("Recording process error:", error);
    sendResponse({ error: error.message });
  }
}

async function stopRecordingFlow() {
  chrome.runtime.sendMessage({
    type: "STOP_RECORDING",
    target: "offscreen"
  });
}

async function setupOffscreenDocument(path) {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: path,
    reasons: ['USER_MEDIA'],
    justification: 'Recording screen content',
  });
}

async function closeOffscreenDocument() {
  if (!(await chrome.offscreen.hasDocument())) return;
  await chrome.offscreen.closeDocument();
}

function saveRecording(url) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `ai-recording_${timestamp}.webm`;

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  });
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    tool: "cursor",
    color: "#FFEB3B",
    lineWidth: 4
  });
});
