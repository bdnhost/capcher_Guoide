// offscreen.js
// Handles MediaRecorder for Manifest V3

let recorder;
let data = [];

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== "offscreen") return;

  if (message.type === "START_RECORDING") {
    startRecording(message.streamId, message.settings);
  } else if (message.type === "STOP_RECORDING") {
    stopRecording();
  } else if (message.type === "PAUSE_RECORD") {
    if (recorder?.state === "recording") {
      recorder.pause();
    }
  } else if (message.type === "RESUME_RECORD") {
    if (recorder?.state === "paused") {
      recorder.resume();
    }
  }
});

async function startRecording(streamId, settings = {}) {
  if (recorder?.state === "recording") {
    throw new Error("Recorder already active.");
  }

  try {
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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioSource === 'system' || audioSource === 'both' ? {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      } : false,
      video: videoConstraints
    });

    // Handle microphone if needed
    if (audioSource === 'microphone' || audioSource === 'both') {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStream.getAudioTracks().forEach(track => stream.addTrack(track));
      } catch (micErr) {
        console.warn("Microphone access denied or failed", micErr);
      }
    }

    // Add audio track if needed (handling system vs mic would be improved here)

    recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9'
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        data.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(data, { type: "video/webm" });
      const url = URL.createObjectURL(blob);

      // Send the result back to background script
      chrome.runtime.sendMessage({
        type: "RECORDING_COMPLETE",
        url: url,
        target: "background"
      });

      // Clean up
      stream.getTracks().forEach(t => t.stop());
      data = [];
    };

    recorder.start(1000);

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
  if (recorder?.state === "recording" || recorder?.state === "paused") {
    recorder.stop();
  }
}
