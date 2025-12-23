// offscreen.js
// Handles MediaRecorder for Manifest V3

console.log('Offscreen script loaded');

let recorder;
let data = [];
let currentStream = null;

chrome.runtime.onMessage.addListener(async (message) => {
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
  try {
    // Clean up any existing recorder first
    if (recorder) {
      // If recorder exists and is recording/paused, stop it first
      if (recorder.state === "recording" || recorder.state === "paused") {
        console.log("Stopping existing recorder before starting new one");
        recorder.stop();
      }
      recorder = null;
    }

    // Clear data array for fresh recording
    data = [];

    const quality = settings.videoQuality || 'medium';
    const audioSource = settings.audioSource || 'system';

    const videoConstraints = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: streamId
      }
    };

    // Apply quality constraints
    if (quality === 'high') {
      videoConstraints.mandatory.maxWidth = 1920;
      videoConstraints.mandatory.maxHeight = 1080;
      videoConstraints.mandatory.maxFrameRate = 30;
    } else if (quality === 'medium') {
      videoConstraints.mandatory.maxWidth = 1280;
      videoConstraints.mandatory.maxHeight = 720;
      videoConstraints.mandatory.maxFrameRate = 30;
    } else {
      videoConstraints.mandatory.maxWidth = 854;
      videoConstraints.mandatory.maxHeight = 480;
      videoConstraints.mandatory.maxFrameRate = 24;
    }

    console.log('Requesting media stream with streamId:', streamId);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioSource === 'system' || audioSource === 'both' ? {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      } : false,
      video: videoConstraints
    });

    console.log('Media stream obtained successfully');
    currentStream = stream;

    // Handle microphone if needed
    if (audioSource === 'microphone' || audioSource === 'both') {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStream.getAudioTracks().forEach(track => stream.addTrack(track));
      } catch (micErr) {
        console.warn("Microphone access denied or failed", micErr);
      }
    }

    // Check if MediaRecorder supports the requested codec
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn('vp9 codec not supported, falling back to vp8');
      mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn('vp8 codec not supported, using default');
        mimeType = 'video/webm';
      }
    }

    recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        data.push(event.data);
      }
    };

    recorder.onstop = () => {
      console.log('Recorder stopped, creating blob from', data.length, 'chunks');
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
      console.error("MediaRecorder error:", event.error);
      chrome.runtime.sendMessage({
        type: "RECORDING_ERROR",
        error: event.error?.message || "Unknown recording error",
        target: "background"
      });
    };

    console.log('Starting recorder with mimeType:', mimeType);
    recorder.start(1000);

    console.log('Recorder state after start:', recorder.state);

    // Notify background that we successfully started
    chrome.runtime.sendMessage({
      type: "RECORDING_STARTED",
      target: "background"
    });

  } catch (err) {
    console.error("Offscreen startRecording failed:", err);
    chrome.runtime.sendMessage({
      type: "RECORDING_ERROR",
      error: err.message,
      target: "background"
    });
  }
}

function stopRecording() {
  console.log('stopRecording called, recorder state:', recorder?.state);

  if (recorder?.state === "recording" || recorder?.state === "paused") {
    console.log('Stopping recorder');
    recorder.stop();
  } else {
    console.warn('Cannot stop - invalid recorder state:', recorder?.state);
  }
}
