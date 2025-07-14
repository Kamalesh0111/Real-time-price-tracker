import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { registerServiceWorkerAndSubscribe } from '../lib/push-notifications';

export default function Dashboard({ session }) {
  // State for the form
  const [url, setUrl] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // State for the product list
  const [trackedItems, setTrackedItems] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // State for notifications
  const [notificationStatus, setNotificationStatus] = useState('UNSUPPORTED');

  // State for expanding long text
  const [expanded, setExpanded] = useState({});
  const TRUNCATE_LIMIT = 70; // Character limit before we truncate the title

  const fetchTrackedItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('alerts')
      .select(`id, target_price, is_active, product:products!inner(id, url, name, image_url, prices(price, scraped_at))`)
      .eq('user_id', session.user.id)
      .order('scraped_at', { foreignTable: 'product.prices', ascending: false });

    if (error) {
      console.error('Error fetching tracked items:', error);
    } else {
      const formattedData = data.map(item => ({
        ...item,
        latest_price: item.product.prices.length > 0 ? item.product.prices[0].price : null,
      }));
      setTrackedItems(formattedData);
    }
    setListLoading(false);
  }, [session.user.id]);

  useEffect(() => {
    fetchTrackedItems();
    
    // Check for push notification support
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => setNotificationStatus(sub ? 'ENABLED' : 'READY'));
      });
    }
  }, [fetchTrackedItems]);

  const handleEnableNotifications = async () => {
    const success = await registerServiceWorkerAndSubscribe(session.user.id);
    if (success) {
      setNotificationStatus('ENABLED');
      alert('Notifications have been enabled!');
    } else {
      alert('Failed to enable notifications. Please check the console for errors.');
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const { data: product, error: productError } = await supabase.from('products').upsert({ url }).select().single();
      if (productError) throw productError;

      const { error: alertError } = await supabase.from('alerts').insert({ user_id: session.user.id, product_id: product.id, target_price: parseFloat(targetPrice) });
      if (alertError) throw alertError;

      alert('Product tracking initiated! Fetching details...');

      await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/api/scrape-now`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url })
      });

      // Manually fetch after adding to get the "Loading..." state updated quickly
      fetchTrackedItems();

      setUrl('');
      setTargetPrice('');
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setFormLoading(false);
    }
  };
  
  // THIS IS THE CORRECTED FUNCTION
  const handleReenableAlert = async (alertId) => {
    try {
        const { error } = await supabase
            .from('alerts')
            .update({ is_active: true })
            .eq('id', alertId);

        if (error) throw error;
        
        // Manually re-fetch the data after the update succeeds
        fetchTrackedItems(); // This forces the UI to refresh

    } catch (error) {
        alert(`Error re-enabling alert: ${error.message}`);
    }
  };
  
  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };


  return (
    <div className="space-y-8">
      <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold mb-4">Track a New Product</h2>
        <form onSubmit={handleAddProduct} className="flex flex-col md:flex-row gap-4">
          <input type="url" placeholder="Product URL" value={url} onChange={(e) => setUrl(e.target.value)} required className="flex-grow px-4 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input type="number" placeholder="Target Price" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} required step="0.01" className="w-full md:w-48 px-4 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="submit" disabled={formLoading} className="px-6 py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{formLoading ? 'Adding...' : 'Track'}</button>
        </form>
        {notificationStatus === 'READY' && <button onClick={handleEnableNotifications} className="mt-4 px-4 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-700">Enable Push Notifications</button>}
        {notificationStatus === 'ENABLED' && <p className="mt-4 text-sm text-green-400">✓ Push Notifications are active.</p>}
      </div>
      
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Your Tracked Products</h2>
        {listLoading ? <p className="text-center">Loading...</p> : trackedItems.length === 0 ? <p className="text-center text-gray-400">You are not tracking any products.</p> : trackedItems.map(({ id, target_price, is_active, latest_price, product }) => (
          <div key={id} className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-gray-800 rounded-lg shadow">
            <img src={product.image_url || 'https://via.placeholder.com/150'} alt={product.name} className="w-24 h-24 object-contain rounded-md bg-white flex-shrink-0" />
            <div className="flex-grow w-full overflow-hidden text-center sm:text-left">
              <h3 className={`font-semibold text-lg ${!expanded[id] ? 'truncate' : ''}`}>
                {product.name || 'Loading name...'}
              </h3>
              
              {(product.name && product.name.length > TRUNCATE_LIMIT) && (
                <button onClick={() => toggleExpand(id)} className="text-xs text-cyan-400 hover:underline">
                  {expanded[id] ? 'Show less' : 'Show more'}
                </button>
              )}
              <a href={product.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:underline truncate w-full block">
                {product.url}
              </a>
              
              <div className="flex items-baseline justify-center sm:justify-start gap-4 mt-2">
                <p className="text-2xl font-bold text-green-400">{latest_price ? `₹${latest_price}` : 'N/A'}</p>
                <p className="text-md text-gray-400">Target: ₹{target_price}</p>
              </div>
              
              {!is_active && (
                <div className="mt-2">
                    <span className="text-xs text-yellow-400 block">Alert triggered.</span>
                    <button 
                        onClick={() => handleReenableAlert(id)} 
                        className="mt-1 px-3 py-1 text-xs font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                        Re-enable
                    </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}