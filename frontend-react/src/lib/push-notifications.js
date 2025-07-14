const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const API_URL = import.meta.env.VITE_BACKEND_API_URL;

// Helper to convert urlBase64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorkerAndSubscribe(userId) {
  if (!('serviceWorker' in navigator && 'PushManager' in window)) {
    console.warn('Push messaging is not supported');
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('Service Worker registered.');

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    console.log('Push subscription successful.');

    // Send the subscription to the backend
    await fetch(`${API_URL}/api/save-subscription`, {
      method: 'POST',
      body: JSON.stringify({ userId, subscription }),
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('Subscription sent to server.');
    return true;
  } catch (error) {
    console.error('Service Worker or Push Subscription failed:', error);
    return false;
  }
}