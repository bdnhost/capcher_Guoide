// AI Screen Recorder - Settings Page Controller
// Enhanced with Hebrew Support and Robust Error Handling

class SettingsController {
  constructor() {
    this.settings = {
      videoQuality: 'medium',
      audioSource: 'system',
      showTimer: true,
      autoSave: true,
      defaultTool: 'cursor',
      defaultColor: '#FFEB3B',
      defaultLineWidth: 4,
      enableTouch: true,
      enableAI: false,
      deepseekApiKey: '',
      aiModel: 'deepseek-chat',
      autoCaption: false,
      smartAnnotations: false,
      aiTextGeneration: false,
      contentAnalysis: false
    };

    this.init();
  }

  init() {
    this.loadSettings();
    this.setupUI();
    this.setupEventListeners();
    console.log('Settings controller initialized');
  }

  setupUI() {
    // Basic elements
    this.videoQuality = document.getElementById('videoQuality');
    this.audioSource = document.getElementById('audioSource');
    this.showTimer = document.getElementById('showTimer');
    this.autoSave = document.getElementById('autoSave');
    this.defaultTool = document.getElementById('defaultTool');
    this.defaultColor = document.getElementById('defaultColor');
    this.defaultLineWidth = document.getElementById('defaultLineWidth');
    this.lineWidthDisplay = document.getElementById('lineWidthDisplay');
    this.enableTouch = document.getElementById('enableTouch');

    // AI elements
    this.enableAI = document.getElementById('enableAI');
    this.deepseekApiKey = document.getElementById('deepseekApiKey');
    this.aiModel = document.getElementById('aiModel');
    this.autoCaption = document.getElementById('autoCaption');
    this.smartAnnotations = document.getElementById('smartAnnotations');
    this.aiTextGeneration = document.getElementById('aiTextGeneration');
    this.contentAnalysis = document.getElementById('contentAnalysis');

    // Buttons
    this.testApiKeyBtn = document.getElementById('testApiKey');
    this.apiTestResult = document.getElementById('apiTestResult');
    this.backBtn = document.getElementById('backBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.saveBtn = document.getElementById('saveBtn');
    this.status = document.getElementById('status');

    this.updateUI();
  }

  setupEventListeners() {
    if (this.defaultLineWidth) {
      this.defaultLineWidth.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        if (this.lineWidthDisplay) {
          this.lineWidthDisplay.textContent = `${value} פיקסלים`;
        }
      });
    }

    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => window.close());
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        if (confirm('לאפס את כל ההגדרות לברירת המחדל?')) {
          this.resetToDefaults();
        }
      });
    }

    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', () => this.saveSettings());
    }

    if (this.testApiKeyBtn) {
      this.testApiKeyBtn.addEventListener('click', () => this.testApiConnection());
    }

    if (this.enableAI) {
      this.enableAI.addEventListener('change', (e) => {
        const aiEnabled = e.target.checked;
        this.toggleAIElements(aiEnabled);
      });
    }

    if (this.deepseekApiKey) {
      this.deepseekApiKey.addEventListener('input', () => {
        if (this.apiTestResult) this.apiTestResult.textContent = '';
      });
    }
  }

  toggleAIElements(enabled) {
    const elements = [
      this.deepseekApiKey, this.aiModel, this.autoCaption,
      this.smartAnnotations, this.aiTextGeneration,
      this.contentAnalysis, this.testApiKeyBtn
    ];

    elements.forEach(el => {
      if (el) el.disabled = !enabled;
    });
  }

  loadSettings() {
    chrome.storage.local.get(Object.keys(this.settings), (result) => {
      Object.keys(this.settings).forEach(key => {
        if (result[key] !== undefined) {
          this.settings[key] = result[key];
        }
      });
      this.updateUI();
    });
  }

  updateUI() {
    if (this.videoQuality) this.videoQuality.value = this.settings.videoQuality;
    if (this.audioSource) this.audioSource.value = this.settings.audioSource;
    if (this.showTimer) this.showTimer.checked = this.settings.showTimer;
    if (this.autoSave) this.autoSave.checked = this.settings.autoSave;
    if (this.defaultTool) this.defaultTool.value = this.settings.defaultTool;
    if (this.defaultColor) this.defaultColor.value = this.settings.defaultColor;
    if (this.defaultLineWidth) {
      this.defaultLineWidth.value = this.settings.defaultLineWidth;
      if (this.lineWidthDisplay) {
        this.lineWidthDisplay.textContent = `${this.settings.defaultLineWidth} פיקסלים`;
      }
    }
    if (this.enableTouch) this.enableTouch.checked = this.settings.enableTouch;

    if (this.enableAI) {
      this.enableAI.checked = this.settings.enableAI;
      this.toggleAIElements(this.settings.enableAI);
    }

    if (this.deepseekApiKey) this.deepseekApiKey.value = this.settings.deepseekApiKey || '';
    if (this.aiModel) this.aiModel.value = this.settings.aiModel;
    if (this.autoCaption) this.autoCaption.checked = this.settings.autoCaption;
    if (this.smartAnnotations) this.smartAnnotations.checked = this.settings.smartAnnotations;
    if (this.aiTextGeneration) this.aiTextGeneration.checked = this.settings.aiTextGeneration;
    if (this.contentAnalysis) this.contentAnalysis.checked = this.settings.contentAnalysis;
  }

  async testApiConnection() {
    const apiKey = this.deepseekApiKey.value.trim();
    if (!apiKey) {
      this.showTestResult('נא להזין מפתח API תחילה', '#ef4444');
      return;
    }

    this.showTestResult('בודק חיבור...', '#f59e0b');
    this.testApiKeyBtn.disabled = true;

    try {
      const response = await fetch('https://api.deepseek.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        this.showTestResult('✅ החיבור הצליח!', '#10b981');
      } else {
        const errorData = await response.json();
        this.showTestResult(`❌ שגיאה: ${errorData.error?.message || response.statusText}`, '#ef4444');
      }
    } catch (error) {
      this.showTestResult(`❌ החיבור נכשל: ${error.message}`, '#ef4444');
    } finally {
      this.testApiKeyBtn.disabled = false;
    }
  }

  showTestResult(text, color) {
    if (this.apiTestResult) {
      this.apiTestResult.textContent = text;
      this.apiTestResult.style.color = color;
    }
  }

  saveSettings() {
    const newSettings = {
      videoQuality: this.videoQuality?.value,
      audioSource: this.audioSource?.value,
      showTimer: this.showTimer?.checked,
      autoSave: this.autoSave?.checked,
      defaultTool: this.defaultTool?.value,
      defaultColor: this.defaultColor?.value,
      defaultLineWidth: parseInt(this.defaultLineWidth?.value),
      enableTouch: this.enableTouch?.checked,
      enableAI: this.enableAI?.checked,
      deepseekApiKey: this.deepseekApiKey?.value.trim(),
      aiModel: this.aiModel?.value,
      autoCaption: this.autoCaption?.checked,
      smartAnnotations: this.smartAnnotations?.checked,
      aiTextGeneration: this.aiTextGeneration?.checked,
      contentAnalysis: this.contentAnalysis?.checked
    };

    chrome.storage.local.set(newSettings, () => {
      if (chrome.runtime.lastError) {
        this.showStatus('שגיאה בשמירה: ' + chrome.runtime.lastError.message, 'error');
      } else {
        this.showStatus('ההגדרות נשמרו בהצלחה!', 'success');

        // Sync drawing tools
        chrome.storage.local.set({
          tool: newSettings.defaultTool,
          color: newSettings.defaultColor,
          lineWidth: newSettings.defaultLineWidth
        });

        chrome.runtime.sendMessage({
          tool: newSettings.defaultTool,
          color: newSettings.defaultColor,
          lineWidth: newSettings.defaultLineWidth
        });

        setTimeout(() => window.close(), 1500);
      }
    });
  }

  resetToDefaults() {
    const defaults = {
      videoQuality: 'medium',
      audioSource: 'system',
      showTimer: true,
      autoSave: true,
      defaultTool: 'cursor',
      defaultColor: '#FFEB3B',
      defaultLineWidth: 4,
      enableTouch: true,
      enableAI: false,
      deepseekApiKey: '',
      aiModel: 'deepseek-chat',
      autoCaption: false,
      smartAnnotations: false,
      aiTextGeneration: false,
      contentAnalysis: false
    };

    this.settings = { ...defaults };
    this.updateUI();
    this.showStatus('ההגדרות אופסו', 'success');
  }

  showStatus(message, type = 'success') {
    if (this.status) {
      this.status.textContent = message;
      this.status.className = `status ${type}`;
      setTimeout(() => {
        this.status.className = 'status';
        this.status.textContent = '';
      }, 3000);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SettingsController();
});
