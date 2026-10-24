// Only interface files belong in the offline cache and static delivery.
export const RUNTIME_FILES=['index.html','styles.css','gantt.css','app.js','payment-editor.js','domain.js','storage.js','schema-data.js','schema-validator.js','exchange.js','files-view.js','finance.js','finance-view.js','gantt.js','gantt-view.js','gantt-print.js','offline.js','manifest.webmanifest','icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
export const DELIVERY_FILES=[...RUNTIME_FILES,'sw.js','app-assets.js'];
