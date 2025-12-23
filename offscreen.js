// offscreen.js
// Handles MediaRecorder for Manifest V3

console.log('Offscreen script loaded');

let recorder = null;
let data = [];
let currentStream = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "offscreen") return;

  console.log('Offscreen received message:', message.type);

  if (message.type === "START_RECORDING") {
    startRecording(message.streamId, message.settings);
  } else if (message.type === "STOP_RECORDING") {
    stopRecording();
  } else if (message.type === "PAUSE_RECORD") {
    if (recorder?.state === "recording") {
      console.log('Pausing recorder');
      recorder.pause();
    } else {
      console.warn('Cannot pause - recorder state:', recorder?.state);
    }
  } else if (message.type === "RESUME_RECORD") {
    if (recorder?.state === "paused") {
      console.log('Resuming recorder');
      recorder.resume();
    } else {
      console.warn('Cannot resume - recorder state:', recorder?.state);
    }
  }
});

async function startRecording(streamId, settings = {}) {
  console.log('startRecording called with streamId:', streamId);

  try {
    // Clean up any existing recorder first
    if (recorder) {
      console.log('Cleaning up existing recorder, state:', recorder.state);
      if (recorder.state === "recording" || recorder.state === "paused") {
        recorder.stop();
        // Wait for stop to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      recorder = null;
    }

    // Clean up existing stream
    if (currentStream) {
      console.log('Cleaning up existing stream');
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }

    // Clear data array for fresh recording
    data = [];

    const quality = settings.videoQuality || 'medium';
    const audioSource = settings.audioSource || 'none';

    console.log('Quality:', quality, 'Audio:', audioSource);

    // Simple video-only constraints
    const constraints = {
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
          maxWidth: 1280,
          maxHeight: 720,
          maxFrameRate: 30
        }
      },
      audio: false // Start with no audio for simplicity
    };

    console.log('Requesting media stream...');

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    console.log('Media stream obtained, tracks:', stream.getTracks().length);
    currentStream = stream;

    // Use simple mimeType
    const mimeType = 'video/webm';
    console.log('Using mimeType:', mimeType);

    recorder = new MediaRecorder(stream, { mimeType });

    console.log('MediaRecorder created, initial state:', recorder.state);

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        console.log('Data available, size:', event.data.size);
        data.push(event.data);
      }
    };

    recorder.onstart = () => {
      console.log('MediaRecorder started!');
      // Notify background that we successfully started
      chrome.runtime.sendMessage({
        type: "RECORDING_STARTED",
        target: "background"
      });
    };

    recorder.onstop = () => {
      console.log('Recorder stopped, creating blob from', data.length, 'chunks');

      if (data.length === 0) {
        console.error('No data chunks recorded!');
        chrome.runtime.sendMessage({
          type: "RECORDING_ERROR",
          error: "No data was recorded",
          target: "background"
        });
        return;
      }

      const blob = new Blob(data, { type: "video/webm" });
      const url = URL.createObjectURL(blob);

      console.log('Recording complete, blob size:', blob.size, 'bytes');

      // Send the result back to background script
      chrome.runtime.sendMessage({
        type: "RECORDING_COMPLETE",
        url: url,
        target: "background"
      });

      // Clean up
      if (currentStream) {
        currentStream.getTracks().forEach(t => {
          console.log('Stopping track:', t.kind);
          t.stop();
        });
        currentStream = null;
      }
      data = [];
      recorder = null;
    };

    recorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
      const errorMsg = event.error?.message || event.error?.name || "Unknown recording error";
      chrome.runtime.sendMessage({
        type: "RECORDING_ERROR",
        error: errorMsg,
        target: "background"
      });
    };

    console.log('Starting recorder...');
    recorder.start(1000); // Collect data every second

    console.log('Recorder state after start():', recorder.state);

  } catch (err) {
    console.error("startRecording failed:", err);
    chrome.runtime.sendMessage({
      type: "RECORDING_ERROR",
      error: err.message || err.toString(),
      target: "background"
    });
  }
}

function stopRecording() {
  console.log('stopRecording called, recorder state:', recorder?.state);

  if (!recorder) {
    console.warn('No recorder to stop');
    return;
  }

  if (recorder.state === "recording" || recorder.state === "paused") {
    console.log('Stopping recorder');
    recorder.stop();
  } else {
    console.warn('Cannot stop - invalid recorder state:', recorder.state);
  }
}
