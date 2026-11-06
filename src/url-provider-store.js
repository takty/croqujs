/** Persist execution mappings across Service Worker restarts; never store file contents here. */
export async function accessRun(action, key, value) {
	const database = await new Promise((resolve, reject) => {
		const request = indexedDB.open('croqujs-execution-v1', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('runs');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	try {
		return await new Promise((resolve, reject) => {
			const transaction = database.transaction('runs', action === 'get' ? 'readonly' : 'readwrite');
			const store = transaction.objectStore('runs');
			let request;
			if (action === 'put') request = store.put(value, key);
			else if (action === 'delete') request = store.delete(key);
			else request = store.get(key);
			transaction.oncomplete = () => resolve(request.result);
			transaction.onabort = () => reject(transaction.error ?? new Error('Execution mapping transaction aborted'));
			transaction.onerror = () => reject(transaction.error);
		});
	} finally {
		database.close();
	}
}
