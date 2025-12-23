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
      logger.warn("Already recording, stopping previous recording first");
      // Force stop previous recording
      stopRecordingFlow();
      // Wait a bit for cleanup
      setTimeout(() => {
        startRecordingProcess(message.streamId, sendResponse);
      }, 100);
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
    logger.info("Recording started successfully!");
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

    // Don't send these messages to avoid confusion
    // chrome.runtime.sendMessage({ type: "RECORDING_STARTED" });
    // broadcastToTabs({ type: "RECORDING_STARTED" });
  }

  if (message.type === "RECORDING_COMPLETE") {
    logger.info("Recording completed successfully!");
    isRecording = false;
    isPaused = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    accumulatedTime = 0;
    broadcastToTabs({ type: 'UPDATE_TIMER', time: '00:00' }); // Reset timer display
    saveRecording(message.url);

    // Close offscreen document after a delay to ensure cleanup
    setTimeout(() => {
      closeOffscreenDocument();
    }, 500);
  }

  if (message.type === "RECORDING_ERROR") {
    logger.error("Recording error:", message.error);
    isRecording = false;
    isPaused = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    accumulatedTime = 0;
    broadcastToTabs({ type: 'UPDATE_TIMER', time: '00:00' }); // Reset timer display

    // Close offscreen document after a delay to ensure cleanup
    setTimeout(() => {
      closeOffscreenDocument();
    }, 500);
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
    logger.info("Starting recording process with streamId:", streamId);

    // Ensure we have a clean state
    isRecording = false;
    isPaused = false;

    // Setup or reuse offscreen document
    await setupOffscreenDocument('offscreen.html');

    const settings = await chrome.storage.local.get(['videoQuality', 'audioSource']);
    logger.debug("Settings loaded:", settings);

    // Send message to offscreen to start recording
    logger.debug("Sending START_RECORDING message to offscreen");
    chrome.runtime.sendMessage({
      type: "START_RECORDING",
      target: "offscreen",
      streamId: streamId,
      settings: settings
    });

    sendResponse({ success: true });
    logger.info("Recording process initialization complete");
  } catch (error) {
    logger.error("Recording process error:", error);
    isRecording = false;
    isPaused = false;
    sendResponse({ error: error.message });

    // Close offscreen on error
    setTimeout(() => closeOffscreenDocument(), 100);
  }
}

async function stopRecordingFlow() {
  chrome.runtime.sendMessage({
    type: "STOP_RECORDING",
    target: "offscreen"
  });
}

async function setupOffscreenDocument(path) {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
      logger.debug("Offscreen document already exists");
      return;
    }

    await chrome.offscreen.createDocument({
      url: path,
      reasons: ['USER_MEDIA'],
      justification: 'Recording screen content',
    });

    logger.debug("Offscreen document created successfully");
  } catch (error) {
    logger.error("Failed to setup offscreen document:", error);
    throw error;
  }
}

async function closeOffscreenDocument() {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
      logger.debug("No offscreen document to close");
      return;
    }

    await chrome.offscreen.closeDocument();
    logger.debug("Offscreen document closed successfully");
  } catch (error) {
    logger.error("Failed to close offscreen document:", error);
    // Don't throw - closing is not critical
  }
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
