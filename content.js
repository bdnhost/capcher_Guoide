// AI Screen Recorder Pro - Content Script
// This file is kept minimal as overlay.js handles all UI interactions

console.log('AI Screen Recorder Pro - Content script loaded');

// Optional: Add performance monitoring
if (typeof performance !== 'undefined' && performance.memory) {
  console.debug('Memory usage:', {
    usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
    totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
    jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB'
  });
}