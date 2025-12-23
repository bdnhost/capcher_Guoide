// AI Screen Recorder - Drawing Overlay
// Enhanced version with AI-powered text generation

class DrawingOverlay {
  constructor() {
    this.tool = "cursor";
    this.color = "#FFEB3B"; // Yellow
    this.lineWidth = 4;
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.drawingHistory = [];
    this.historyIndex = -1;
    this.recordingGoal = "";
    this.aiSettings = {
      enabled: false,
      apiKey: '',
      model: 'deepseek-chat',
      aiTextGeneration: false,
      smartAnnotations: false
    };

    this.init();
  }

  init() {
    // Load saved settings
    chrome.storage.local.get(["tool", "color", "lineWidth"], (res) => {
      if (res.tool) this.tool = res.tool;
      if (res.color) this.color = res.color;
      if (res.lineWidth) this.lineWidth = res.lineWidth;
      this.updatePointerEvents();
    });

    // Load AI settings
    this.loadAISettings();

    // Listen for tool changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.tool) {
        this.tool = changes.tool.newValue;
        this.updatePointerEvents();
        this.updateToolbarButtons();
      }
      if (changes.color) this.color = changes.color.newValue;
      if (changes.lineWidth) this.lineWidth = changes.lineWidth.newValue;

      // Check for AI settings changes
      if (changes.enableAI !== undefined) this.aiSettings.enabled = changes.enableAI.newValue;
      if (changes.deepseekApiKey !== undefined) this.aiSettings.apiKey = changes.deepseekApiKey.newValue;
      if (changes.aiModel !== undefined) this.aiSettings.model = changes.aiModel.newValue;
      if (changes.aiTextGeneration !== undefined) this.aiSettings.aiTextGeneration = changes.aiTextGeneration.newValue;
    });

    // Create canvas overlay
    this.createCanvas();

    // Set up event listeners
    this.setupEventListeners();

    // Handle window resize
    window.addEventListener("resize", () => this.handleResize());

    // Listen for messages from background/popup
    chrome.runtime.onMessage.addListener((msg) => this.handleMessage(msg));

    // Create AI Assistant Panel (Hidden by default)
    this.createAIAssistant();

    // Create Floating Toolbar
    this.createToolbar();

    console.log("Drawing overlay initialized with AI support");
  }

  loadAISettings() {
    chrome.storage.local.get([
      'enableAI', 'deepseekApiKey', 'aiModel', 'aiTextGeneration'
    ], (result) => {
      if (result.enableAI !== undefined) this.aiSettings.enabled = result.enableAI;
      if (result.deepseekApiKey) this.aiSettings.apiKey = result.deepseekApiKey;
      if (result.aiModel) this.aiSettings.model = result.aiModel;
      if (result.aiTextGeneration !== undefined) this.aiSettings.aiTextGeneration = result.aiTextGeneration;
    });
  }

  createCanvas() {
    // Remove existing canvas if any
    const existingCanvas = document.getElementById("ai-recorder-overlay");
    if (existingCanvas) {
      existingCanvas.remove();
    }

    // Create new canvas
    this.canvas = document.createElement("canvas");
    this.canvas.id = "ai-recorder-overlay";
    this.canvas.style.position = "fixed";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.zIndex = "999999";
    this.canvas.style.pointerEvents = "none";
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    // Set initial pointer events based on tool
    this.updatePointerEvents();

    // Set initial drawing style
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  updatePointerEvents() {
    if (this.tool === "cursor") {
      this.canvas.style.pointerEvents = "none";
    } else {
      this.canvas.style.pointerEvents = "auto";
    }
  }

  setupEventListeners() {
    // Mouse events for drawing
    document.addEventListener("mousedown", (e) => this.startDrawing(e));
    document.addEventListener("mousemove", (e) => this.draw(e));
    document.addEventListener("mouseup", () => this.stopDrawing());

    // Touch events for mobile support
    document.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
    });

    document.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.draw({ clientX: touch.clientX, clientY: touch.clientY });
    });

    document.addEventListener("touchend", () => this.stopDrawing());

    // Click events for shape tools
    document.addEventListener("click", (e) => this.handleClick(e));

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  handleKeyDown(e) {
    // Ignore if typing in a text field or if text tool is active (but text tool uses prompt for now)
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const key = e.key.toLowerCase();

    // Undo/Redo
    if (e.ctrlKey || e.metaKey) {
      if (key === "z") {
        e.preventDefault();
        this.undo();
      } else if (key === "y") {
        e.preventDefault();
        this.redo();
      }
      return;
    }

    switch (key) {
      case "escape":
        this.setTool("cursor");
        break;
      case "p":
        this.setTool("pen");
        break;
      case "h":
        this.setTool("highlighter");
        break;
      case "c":
        this.setTool("circle");
        break;
      case "r":
        this.setTool("rectangle");
        break;
      case "a":
        this.setTool("arrow");
        break;
      case "t":
        this.setTool("text");
        break;
      case "delete":
      case "backspace":
        if (confirm("Clear all drawings?")) this.clearCanvas();
        break;
    }
  }

  setTool(toolId) {
    this.tool = toolId;
    this.updatePointerEvents();
    // Sync with storage so popup stays in sync
    chrome.storage.local.set({ tool: toolId });
  }

  startDrawing(e) {
    if (this.tool === "pen" || this.tool === "highlighter") {
      this.isDrawing = true;
      [this.lastX, this.lastY] = [e.clientX, e.clientY];

      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);

      // Set drawing style based on tool
      if (this.tool === "highlighter") {
        this.ctx.globalAlpha = 0.3;
        this.ctx.lineWidth = 15;
      } else {
        this.ctx.globalAlpha = 1.0;
        this.ctx.lineWidth = this.lineWidth;
      }

      this.ctx.strokeStyle = this.color;
      this.ctx.lineCap = "round";
    }
  }

  draw(e) {
    if (!this.isDrawing) return;

    this.ctx.lineTo(e.clientX, e.clientY);
    this.ctx.stroke();
    [this.lastX, this.lastY] = [e.clientX, e.clientY];
  }

  stopDrawing() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.saveToHistory();
    }
  }

  handleClick(e) {
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.globalAlpha = 1.0;

    switch (this.tool) {
      case "circle":
        this.ctx.beginPath();
        this.ctx.arc(e.clientX, e.clientY, 40, 0, Math.PI * 2);
        this.ctx.stroke();
        this.saveToHistory();
        break;

      case "rectangle":
        this.ctx.strokeRect(e.clientX - 50, e.clientY - 30, 100, 60);
        this.saveToHistory();
        break;

      case "arrow":
        this.drawArrow(e.clientX, e.clientY, e.clientX + 80, e.clientY + 10);
        this.saveToHistory();
        break;

      case "text":
        this.addText(e.clientX, e.clientY);
        break;
    }
  }

  drawArrow(fromX, fromY, toX, toY) {
    const headLength = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Draw line
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();

    // Draw arrow head
    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(
      toX - headLength * Math.cos(angle - Math.PI / 6),
      toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(
      toX - headLength * Math.cos(angle + Math.PI / 6),
      toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.stroke();
  }

  async addText(x, y) {
    // Check if AI text generation is enabled
    if (this.aiSettings.enabled && this.aiSettings.aiTextGeneration && this.aiSettings.apiKey) {
      try {
        // Show loading indicator
        this.showLoadingIndicator(x, y);

        // Get AI-generated text
        const aiText = await this.generateAIText();

        // Remove loading indicator
        this.removeLoadingIndicator();

        if (aiText) {
          this.drawText(x, y, aiText);
          this.saveToHistory();
          return;
        }
      } catch (error) {
        console.error("AI text generation failed:", error);
        this.removeLoadingIndicator();
        // Fall back to manual input
      }
    }

    // Manual text input (fallback)
    const text = prompt("Enter text:", "Annotation");
    if (text) {
      this.drawText(x, y, text);
      this.saveToHistory();
    }
  }

  drawText(x, y, text) {
    this.ctx.font = "16px Arial";
    this.ctx.fillStyle = this.color;

    // Add text background for better visibility
    const textWidth = this.ctx.measureText(text).width;
    const padding = 4;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.fillRect(x - padding, y - 16 - padding, textWidth + padding * 2, 20 + padding * 2);

    // Draw text
    this.ctx.fillStyle = this.color;
    this.ctx.fillText(text, x, y);
  }

  showLoadingIndicator(x, y) {
    // Create loading indicator
    this.loadingIndicator = document.createElement('div');
    this.loadingIndicator.style.position = 'fixed';
    this.loadingIndicator.style.left = `${x}px`;
    this.loadingIndicator.style.top = `${y}px`;
    this.loadingIndicator.style.background = 'rgba(255, 255, 255, 0.9)';
    this.loadingIndicator.style.border = '1px solid #ddd';
    this.loadingIndicator.style.borderRadius = '8px';
    this.loadingIndicator.style.padding = '8px 12px';
    this.loadingIndicator.style.zIndex = '1000000';
    this.loadingIndicator.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    this.loadingIndicator.innerHTML = '🤖 Generating AI text...';
    this.loadingIndicator.style.fontSize = '14px';
    this.loadingIndicator.style.fontFamily = 'Arial, sans-serif';

    document.body.appendChild(this.loadingIndicator);
  }

  removeLoadingIndicator() {
    if (this.loadingIndicator && this.loadingIndicator.parentNode) {
      this.loadingIndicator.parentNode.removeChild(this.loadingIndicator);
      this.loadingIndicator = null;
    }
  }

  async generateAIText() {
    if (!this.aiSettings.apiKey) {
      throw new Error("No API key configured");
    }

    try {
      // Get current page content for context
      const pageContext = this.getPageContext();

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.aiSettings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.aiSettings.model,
          messages: [
            {
              role: "system",
              content: "You are an AI assistant for a screen recording tool. Generate concise, descriptive text annotations for screen recordings. Keep annotations brief (1-2 sentences) and relevant to screen content."
            },
            {
              role: "user",
              content: `Generate a descriptive annotation for this screen content: ${pageContext}. The annotation should be concise and helpful for understanding the screen recording.`
            }
          ],
          max_tokens: 100,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API request failed');
      }

      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || "AI Annotation";

    } catch (error) {
      console.error("AI text generation error:", error);
      throw error;
    }
  }

  getPageContext() {
    // Extract relevant page context for AI
    const context = [];

    // Page title
    if (document.title) {
      context.push(`Page: ${document.title}`);
    }

    // Visible text content (first 500 chars)
    const visibleText = document.body.innerText || document.body.textContent;
    if (visibleText) {
      context.push(`Content: ${visibleText.substring(0, 500)}...`);
    }

    // Current URL
    context.push(`URL: ${window.location.href}`);

    return context.join('. ');
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawingHistory = [];
    this.historyIndex = -1;
  }

  undo() {
    if (this.historyIndex >= 0) {
      this.historyIndex--;
      this.redrawFromHistory();
    }
  }

  redo() {
    if (this.historyIndex < this.drawingHistory.length - 1) {
      this.historyIndex++;
      this.redrawFromHistory();
    }
  }

  saveToHistory() {
    // Remove any redo history after current position
    this.drawingHistory = this.drawingHistory.slice(0, this.historyIndex + 1);

    // Save current canvas state
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.drawingHistory.push(imageData);
    this.historyIndex++;

    // Limit history size
    if (this.drawingHistory.length > 50) {
      this.drawingHistory.shift();
      this.historyIndex--;
    }
  }

  redrawFromHistory() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = 0; i <= this.historyIndex; i++) {
      this.ctx.putImageData(this.drawingHistory[i], 0, 0);
    }
  }

  handleResize() {
    // Save current drawing
    const currentImage = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    // Resize canvas
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Restore drawing
    this.ctx.putImageData(currentImage, 0, 0);
  }

  handleMessage(msg) {
    switch (msg.tool) {
      case "clear":
        this.clearCanvas();
        break;
      case "undo":
        this.undo();
        break;
      case "redo":
        this.redo();
        break;
      default:
        if (msg.tool) {
          this.tool = msg.tool;
          this.updatePointerEvents();
          this.updateToolbarButtons();
        }
        if (msg.color) {
          this.color = msg.color;
        }
        if (msg.lineWidth) {
          this.lineWidth = msg.lineWidth;
        }
        break;
      case "RECORDING_STARTED":
        this.showRecordingIndicator();
        this.startAIAssistant();
        this.showToolbar();
        break;
      case "RECORDING_STOPPED":
        this.hideRecordingIndicator();
        this.stopAIAssistant();
        this.hideToolbar();
        break;
      case "SET_GOAL":
        this.setGoal(msg.goal);
        break;
      case "UPDATE_TIMER":
        this.updateToolbarTimer(msg.time);
        break;
      case "RECORDING_PAUSED":
        if (this.toolbar) this.toolbar.querySelector("#tb-pause").innerHTML = "▶️";
        break;
      case "RECORDING_RESUMED":
        if (this.toolbar) this.toolbar.querySelector("#tb-pause").innerHTML = "⏸️";
        break;
    }
  }

  showRecordingIndicator() {
    if (this.recIndicator) return;
    this.recIndicator = document.createElement("div");
    this.recIndicator.style.position = "fixed";
    this.recIndicator.style.top = "20px";
    this.recIndicator.style.right = "20px";
    this.recIndicator.style.padding = "8px 16px";
    this.recIndicator.style.background = "rgba(239, 68, 68, 0.8)";
    this.recIndicator.style.color = "white";
    this.recIndicator.style.borderRadius = "20px";
    this.recIndicator.style.fontSize = "12px";
    this.recIndicator.style.fontWeight = "bold";
    this.recIndicator.style.zIndex = "1000000";
    this.recIndicator.style.display = "flex";
    this.recIndicator.style.alignItems = "center";
    this.recIndicator.style.gap = "8px";
    this.recIndicator.innerHTML = '<span style="width:10px;height:10px;background:white;border-radius:50%;animation:pulse-rec 1s infinite"></span> REC';

    const style = document.createElement("style");
    style.innerHTML = "@keyframes pulse-rec { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }";
    document.head.appendChild(style);

    document.body.appendChild(this.recIndicator);
  }

  hideRecordingIndicator() {
    if (this.recIndicator) {
      this.recIndicator.remove();
      this.recIndicator = null;
    }
  }

  createAIAssistant() {
    this.aiPanel = document.createElement("div");
    this.aiPanel.id = "ai-assistant-panel";
    this.aiPanel.dir = "rtl";
    this.aiPanel.style.cssText = `
      position: fixed;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 280px;
      max-height: 80vh;
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      color: white;
      padding: 20px;
      z-index: 1000001;
      display: none;
      flex-direction: column;
      gap: 15px;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    `;

    this.aiPanel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0; font-size:16px; color:#6366f1;">🤖 סוכן AI להדרכה</h3>
        <button id="close-ai" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:18px;">✕</button>
      </div>
      <div id="ai-context" style="font-size:12px; color:#94a3b8; background:rgba(255,255,255,0.05); padding:8px; border-radius:8px;">
        מנתח את המסך...
      </div>
      <div id="ai-advice" style="font-size:14px; line-height:1.5; min-height:60px;">
        התחל הקלטה כדי לקבל הנחיות.
      </div>
      <div id="ai-goal-display" style="font-size:13px; font-style:italic; color:#818cf8; border-top:1px solid rgba(255,255,255,0.1); pt-10px; display:none;">
      </div>
    `;

    document.body.appendChild(this.aiPanel);
    this.aiPanel.querySelector("#close-ai").onclick = () => this.aiPanel.style.display = "none";
    this.aiAdviceEl = this.aiPanel.querySelector("#ai-advice");
    this.aiContextEl = this.aiPanel.querySelector("#ai-context");
    this.aiGoalEl = this.aiPanel.querySelector("#ai-goal-display");
  }

  async startAIAssistant() {
    if (!this.aiSettings.enabled || !this.aiSettings.apiKey) return;

    this.aiPanel.style.display = "flex";
    this.updateAIAdvice("חושב על ההנחיה הבאה...");

    this.aiInterval = setInterval(() => {
      this.getAIInstructions();
    }, 15000); // Every 15 seconds

    this.getAIInstructions();
  }

  stopAIAssistant() {
    if (this.aiInterval) {
      clearInterval(this.aiInterval);
      this.aiInterval = null;
    }
    this.aiPanel.style.display = "none";
  }

  async getAIInstructions() {
    if (!this.aiSettings.apiKey) return;

    try {
      const pageContext = this.getPageContext();
      this.aiContextEl.textContent = "ניתוח תוכן: " + (document.title || "דף אינטרנט");

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.aiSettings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.aiSettings.model,
          messages: [
            {
              role: "system",
              content: `You are an AI instructor helping a user create a high-quality screen recording guide. 
              The language of the UI and instructions is Hebrew. 
              Give brief, actionable advice (1-2 sentences) in Hebrew.
              If the user has a goal, guide them towards it. 
              Focus on: mouse movement, clarity, what to highlight, and sequence of actions.`
            },
            {
              role: "user",
              content: `The user is recording. 
              Goal: ${this.recordingGoal || "General guide"}
              Current Page Context: ${pageContext}
              Give one immediate instruction in Hebrew for the next step of the guide.`
            }
          ],
          max_tokens: 150
        })
      });

      const data = await response.json();
      const advice = data.choices[0]?.message?.content?.trim();
      if (advice) {
        this.updateAIAdvice(advice);
      }
    } catch (err) {
      console.error("AI Instruction failed:", err);
    }
  }

  updateAIAdvice(text) {
    if (this.aiAdviceEl) {
      this.aiAdviceEl.style.opacity = 0;
      setTimeout(() => {
        this.aiAdviceEl.textContent = text;
        this.aiAdviceEl.style.opacity = 1;
        this.aiAdviceEl.style.transition = "opacity 0.5s";
      }, 500);
    }
  }

  setGoal(goal) {
    this.recordingGoal = goal;
    if (this.aiGoalEl) {
      this.aiGoalEl.textContent = "מטרה: " + goal;
      this.aiGoalEl.style.display = goal ? "block" : "none";
    }
  }

  createToolbar() {
    this.toolbar = document.createElement("div");
    this.toolbar.id = "ai-recorder-toolbar";
    this.toolbar.dir = "rtl";
    this.toolbar.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30, 41, 59, 0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 10px 20px;
      z-index: 1000002;
      display: none;
      align-items: center;
      gap: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      animation: slide-up 0.4s cubic-bezier(0,0,0.2,1);
    `;

    // Inject Toolbar Animation CSS
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes slide-up {
        from { transform: translate(-50%, 50px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }
      .toolbar-btn {
        background: transparent;
        border: none;
        color: white;
        padding: 8px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .toolbar-btn:hover { background: rgba(255, 255, 255, 0.1); }
      .toolbar-btn.active { background: #6366f1; }
      .toolbar-divider { width: 1px; height: 24px; background: rgba(255, 255, 255, 0.1); margin: 0 4px; }
      .toolbar-rec-btn { color: #ef4444; }
      .timer-badge { font-family: monospace; font-weight: bold; font-size: 14px; margin-right: 10px; color: #94a3b8; }
    `;
    document.head.appendChild(style);

    this.toolbar.innerHTML = `
      <div class="timer-badge" id="toolbar-timer">00:00</div>
      <button class="toolbar-btn ${this.tool === 'cursor' ? 'active' : ''}" id="tb-cursor" title="בחר (Esc)">🖱️</button>
      <button class="toolbar-btn ${this.tool === 'pen' ? 'active' : ''}" id="tb-pen" title="עט (P)">✏️</button>
      <button class="toolbar-btn ${this.tool === 'highlighter' ? 'active' : ''}" id="tb-highlighter" title="מרקר (H)">🖍️</button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" id="tb-undo" title="ביטול (Ctrl+Z)">↩️</button>
      <button class="toolbar-btn" id="tb-clear" title="נקה הכל">🗑️</button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" id="tb-pause" title="השהה">⏸️</button>
      <button class="toolbar-btn toolbar-rec-btn" id="tb-stop" title="עצור">⏹️</button>
    `;

    document.body.appendChild(this.toolbar);

    // Event Listeners for Toolbar
    this.toolbar.querySelector("#tb-cursor").onclick = () => this.handleToolbarTool("cursor");
    this.toolbar.querySelector("#tb-pen").onclick = () => this.handleToolbarTool("pen");
    this.toolbar.querySelector("#tb-highlighter").onclick = () => this.handleToolbarTool("highlighter");
    this.toolbar.querySelector("#tb-undo").onclick = () => this.undo();
    this.toolbar.querySelector("#tb-clear").onclick = () => { if (confirm("לנקות את כל הציורים?")) this.clearCanvas(); };
    this.toolbar.querySelector("#tb-pause").onclick = () => this.togglePause();
    this.toolbar.querySelector("#tb-stop").onclick = () => chrome.runtime.sendMessage({ type: "STOP_RECORD" });
  }

  handleToolbarTool(toolId) {
    this.setTool(toolId);
    this.updateToolbarButtons();
  }

  updateToolbarButtons() {
    if (!this.toolbar) return;
    this.toolbar.querySelectorAll(".toolbar-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = this.toolbar.querySelector(`#tb-${this.tool}`);
    if (activeBtn) activeBtn.classList.add("active");
  }

  togglePause() {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
      const type = res.isPaused ? "RESUME_RECORD" : "PAUSE_RECORD";
      chrome.runtime.sendMessage({ type: type });
    });
  }

  showToolbar() {
    if (this.toolbar) this.toolbar.style.display = "flex";
  }

  hideToolbar() {
    if (this.toolbar) this.toolbar.style.display = "none";
  }

  updateToolbarTimer(elapsedStr) {
    const timerEl = this.toolbar?.querySelector("#toolbar-timer");
    if (timerEl) timerEl.textContent = elapsedStr;
  }
}

// Initialize the overlay when the page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.drawingOverlay = new DrawingOverlay();
  });
} else {
  window.drawingOverlay = new DrawingOverlay();
}
