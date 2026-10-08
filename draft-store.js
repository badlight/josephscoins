(function (root) {
  "use strict";
  let database;
  function open() {
    if (!root.indexedDB) return Promise.reject(Error("Draft storage is unavailable in this browser."));
    if (!database) database = new Promise((resolve, reject) => {
      const request = root.indexedDB.open("josephs-coins-editor-v2", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(request.error); };
    });
    return database;
  }
  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", "readonly"), request = transaction.objectStore("drafts").get("current");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  async function save(snapshot) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put(snapshot, "current");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || Error("Draft saving was interrupted."));
    });
  }
  root.CoinDrafts = { read, save };
})(window);
