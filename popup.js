// AI Screen Recorder - Popup Controller
// Enhanced version with timer, tool management, and better UI

class PopupController {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.recordingStartTime = null;
    this.timerInterval = null;
    this.currentTool = 'cursor';
    this.currentColor = '#FFEB3B';
    this.currentLineWidth = 4;

    this.init();
  }

  init() {
    // Load saved settings
    chrome.storage.local.get(['tool', 'color', 'lineWidth'], (res) => {
      if (res.tool) this.setTool(res.tool, false);
      if (res.color) this.setColor(res.color, false);
      if (res.lineWidth) this.setLineWidth(res.lineWidth, false);
    });

    // Set up UI elements
    this.setupUI();

    // Set up event listeners
    this.setupEventListeners();

    // Check current recording status
    this.checkRecordingStatus();

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => this.handleMessage(msg));

    console.log('Popup controller initialized');
  }

  setupUI() {
    // Get DOM elements
    this.startBtn = document.getElementById('start');
    this.stopBtn = document.getElementById('stop');
    this.pauseBtn = document.getElementById('pause');
    this.timerElement = document.getElementById('timer');
    this.statusElement = document.getElementById('status');
    this.goalInput = document.getElementById('recording-goal');
    this.goalContainer = document.getElementById('goal-container');

    // Tool buttons
    this.toolButtons = {
      cursor: document.getElementById('cursor'),
      pen: document.getElementById('pen'),
      highlighter: document.getElementById('highlighter'),
      circle: document.getElementById('circle'),
      rectangle: document.getElementById('rectangle'),
      arrow: document.getElementById('arrow'),
      text: document.getElementById('text')
    };

    // Control buttons
    this.undoBtn = document.getElementById('undo');
    this.redoBtn = document.getElementById('redo');
    this.clearBtn = document.getElementById('clear');
    this.settingsBtn = document.getElementById('settings');

    // Color and line width controls
    this.colorPicker = document.getElementById('colorPicker');
    this.lineWidthSlider = document.getElementById('lineWidth');
    this.lineWidthValue = document.getElementById('lineWidthValue');

    // Set initial values
    this.colorPicker.value = this.currentColor;
    this.lineWidthSlider.value = this.currentLineWidth;
    this.lineWidthValue.textContent = `${this.currentLineWidth}px`;
  }

  setupEventListeners() {
    // Recording controls
    this.startBtn.addEventListener('click', () => this.startRecording());
    this.stopBtn.addEventListener('click', () => this.stopRecording());
    this.pauseBtn.addEventListener('click', () => this.togglePause());

    // Tool selection
    Object.keys(this.toolButtons).forEach(toolId => {
      this.toolButtons[toolId].addEventListener('click', () => {
        this.setTool(toolId, true);
      });
    });

    // Canvas controls
    this.undoBtn.addEventListener('click', () => this.sendToolCommand('undo'));
    this.redoBtn.addEventListener('click', () => this.sendToolCommand('redo'));
    this.clearBtn.addEventListener('click', () => this.sendToolCommand('clear'));

    // Settings
    this.settingsBtn.addEventListener('click', () => this.openSettings());

    // Color and line width
    this.colorPicker.addEventListener('input', (e) => {
      this.setColor(e.target.value, true);
    });

    this.lineWidthSlider.addEventListener('input', (e) => {
      this.setLineWidth(parseInt(e.target.value), true);
    });
  }

  setTool(toolId, saveToStorage = true) {
    // Update UI
    Object.keys(this.toolButtons).forEach(id => {
      this.toolButtons[id].classList.remove('active');
    });
    if (this.toolButtons[toolId]) {
      this.toolButtons[toolId].classList.add('active');
    }

    // Update state
    this.currentTool = toolId;

    // Send to background and content scripts
    if (saveToStorage) {
      chrome.storage.local.set({ tool: toolId });
      chrome.runtime.sendMessage({ tool: toolId });
    }
  }

  setColor(color, saveToStorage = true) {
    this.currentColor = color;
    this.colorPicker.value = color;

    if (saveToStorage) {
      chrome.storage.local.set({ color: color });
      chrome.runtime.sendMessage({ color: color });
    }
  }

  setLineWidth(width, saveToStorage = true) {
    this.currentLineWidth = width;
    this.lineWidthValue.textContent = `${width}px`;

    if (saveToStorage) {
      chrome.storage.local.set({ lineWidth: width });
      chrome.runtime.sendMessage({ lineWidth: width });
    }
  }

  startRecording() {
    const goal = this.goalInput.value;
    chrome.runtime.sendMessage({ type: 'SET_GOAL', goal: goal });

    // Request screen selection from popup context (reliable user gesture)
    chrome.desktopCapture.chooseDesktopMedia(
      ["screen", "window", "tab", "audio"],
      (streamId) => {
        if (!streamId) {
          this.showStatus('הקלטה בוטלה', 'idle');
          this.updateRecordingUI();
          return;
        }

        // Send the streamId to background to start the offscreen recording
        chrome.runtime.sendMessage({
          type: 'START_RECORD',
          streamId: streamId
        }, (response) => {
          if (chrome.runtime.lastError) {
            this.showError('הפעולה נכשלה: ' + chrome.runtime.lastError.message);
            return;
          }
          if (response && response.error) {
            this.showError('הפעולה נכשלה: ' + response.error);
          }
        });
      }
    );
  }

  stopRecording() {
    chrome.runtime.sendMessage({ type: 'STOP_RECORD' }, (response) => {
      this.isRecording = false;
      this.isPaused = false;
      this.updateRecordingUI();
      this.showStatus('הקלטה נשמרה', 'idle');
    });
  }

  togglePause() {
    const type = this.isPaused ? 'RESUME_RECORD' : 'PAUSE_RECORD';
    chrome.runtime.sendMessage({ type: type }, (response) => {
      this.isPaused = !this.isPaused;
      this.pauseBtn.textContent = this.isPaused ? '▶️ המשך' : '⏸️ השהה';

      if (this.isPaused) {
        this.showStatus('הקלטה הושהתה', 'idle');
      } else {
        this.showStatus('הקלטה התחדשה', 'recording');
      }
    });
  }

  startTimer() {
    this.stopTimer(); // Clear any existing timer

    this.timerInterval = setInterval(() => {
      if (this.recordingStartTime) {
        const elapsed = Date.now() - this.recordingStartTime;
        this.updateTimer(elapsed);
      }
    }, 1000);

    this.timerElement.style.display = 'block';
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  updateTimer(elapsedMs) {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    this.timerElement.textContent = formatted;
  }

  updateRecordingUI() {
    if (this.isRecording) {
      this.startBtn.style.display = 'none';
      this.stopBtn.style.display = 'flex';
      this.pauseBtn.style.display = 'flex';
      this.stopBtn.disabled = false;
      this.pauseBtn.disabled = false;
      this.timerElement.classList.add('active');
      this.goalContainer.style.display = 'none';
    } else {
      this.startBtn.style.display = 'flex';
      this.stopBtn.style.display = 'none';
      this.pauseBtn.style.display = 'none';
      this.startBtn.disabled = false;
      this.timerElement.classList.remove('active');
      this.goalContainer.style.display = 'block';
    }
  }

  checkRecordingStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response && response.isRecording) {
        this.isRecording = true;
        this.isPaused = response.isPaused;
        this.updateRecordingUI();
        this.pauseBtn.textContent = this.isPaused ? '▶️ המשך' : '⏸️ השהה';
        this.showStatus(this.isPaused ? 'הקלטה הושהתה' : 'בהקלטה...', this.isPaused ? 'idle' : 'recording');
      }
    });
  }

  sendToolCommand(command) {
    chrome.runtime.sendMessage({ tool: command });
  }

  openSettings() {
    // Open the settings page
    chrome.runtime.openOptionsPage();
  }

  showStatus(message, type = 'idle') {
    const statusText = this.statusElement.querySelector('.status-text');
    if (statusText) statusText.textContent = message;
    this.statusElement.className = `status-indicator ${type}`;
  }

  showError(message) {
    const statusText = this.statusElement.querySelector('.status-text');
    if (statusText) statusText.textContent = message;
    this.statusElement.className = 'status-indicator recording';
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'RECORDING_STARTED':
        this.isRecording = true;
        this.updateRecordingUI();
        this.showStatus('בהקלטה...', 'recording');
        break;

      case 'RECORDING_STOPPED':
        this.isRecording = false;
        this.isPaused = false;
        this.updateRecordingUI();
        this.showStatus('הקלטה נשמרה בהצלחה', 'idle');
        break;

      case 'RECORDING_ERROR':
        this.showError(`שגיאת הקלטה: ${msg.error}`);
        break;

      case 'UPDATE_TIMER':
        if (this.timerElement) {
          this.timerElement.textContent = msg.time;
          this.timerElement.style.display = 'block';
        }
        break;

      case 'RECORDING_PAUSED':
        this.isPaused = true;
        this.pauseBtn.textContent = '▶️ המשך';
        this.showStatus('הקלטה הושהתה', 'idle');
        break;

      case 'RECORDING_RESUMED':
        this.isPaused = false;
        this.pauseBtn.textContent = '⏸️ השהה';
        this.showStatus('בהקלטה...', 'recording');
        break;
    }
  }
}

// Initialize when the popup loads
document.addEventListener('DOMContentLoaded', () => {
  window.popupController = new PopupController();
});
