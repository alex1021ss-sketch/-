import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { Category, MenuItem, OrderItem } from '../types';
import { ShoppingCart, Plus, Minus, X } from 'lucide-react';
import clsx from 'clsx';

export default function CustomerOrder() {
  const { tableId } = useParams<{ tableId: string }>();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    api.getInitData()
      .then(data => {
        const sortedCategories = [...data.categories].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        setCategories(sortedCategories);
        setMenuItems(data.menuItems);
        if (sortedCategories.length > 0) {
          setActiveCategory(sortedCategories[0].id);
        }
      })
      .catch(err => {
        console.error("Failed to load init data:", err);
        // We could set an error state here, but ErrorBoundary will catch render errors.
        // This catch prevents unhandled promise rejection which can crash some envs.
      });
  }, []);

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      if (existing && existing.qty > 1) {
        return prev.map(i => i.id === itemId ? { ...i, qty: i.qty - 1 } : i);
      }
      return prev.filter(i => i.id !== itemId);
    });
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    try {
      await api.createOrder({
        tableId: parseInt(tableId || '0'),
        items: cart,
        totalPrice: totalAmount
      });
      alert('點餐成功！廚房已收到您的訂單。');
      setCart([]);
    } catch {
      alert('點餐失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = menuItems.filter(item => item.categoryId === activeCategory);

  return (
    <div className="min-h-screen pb-24 bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-center">桌號 {tableId} 點餐</h1>
      </div>

      {/* Categories */}
      <div className="flex overflow-x-auto gap-2 p-4 bg-white border-b sticky top-14 z-10">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={clsx(
              "px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors",
              activeCategory === cat.id 
                ? "bg-orange-500 text-white" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Menu Grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map(item => (
          <div key={item.id} className="bg-white rounded-lg shadow overflow-hidden flex flex-row h-28">
            <img src={item.image} alt={item.name} className="w-28 h-28 object-cover" />
            <div className="p-3 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-gray-800">{item.name}</h3>
                <p className="text-sm text-gray-500 line-clamp-1">{item.description}</p>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="font-bold text-orange-600">${item.price}</span>
                <button 
                  onClick={() => addToCart(item)}
                  className="bg-orange-100 text-orange-600 p-1.5 rounded-full hover:bg-orange-200"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-4 border-t z-20">
          <div className="max-w-3xl mx-auto">
            <div
              className="flex justify-between items-center mb-4 cursor-pointer"
              onClick={() => setIsCartOpen(true)}
            >
               <div className="flex items-center gap-2">
                 <div className="bg-orange-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                   {totalItems}
                 </div>
                 <span className="font-bold text-lg">購物車</span>
               </div>
               <span className="font-bold text-xl">${totalAmount}</span>
            </div>
            
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {isSubmitting ? '傳送中...' : '確認點餐'}
            </button>
          </div>
        </div>
      )}

      {/* Cart Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-bold">購物車內容</h2>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100"
                aria-label="關閉購物車"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {cart.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 border rounded-lg p-3">
                  <div className="flex-1">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500">${item.price} / 份</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="w-8 h-8 rounded border text-gray-600 hover:bg-gray-50"
                      aria-label="減少數量"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="min-w-[24px] text-center font-bold">{item.qty}</span>
                    <button
                      onClick={() => {
                        const menuItem = menuItems.find(m => m.id === item.id);
                        if (menuItem) {
                          addToCart(menuItem);
                        }
                      }}
                      className="w-8 h-8 rounded border text-gray-600 hover:bg-gray-50"
                      aria-label="增加數量"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))}
                      className="w-8 h-8 rounded border text-red-600 hover:bg-red-50"
                      aria-label="刪除品項"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="flex justify-between mb-3">
                <span className="text-gray-600">總計</span>
                <span className="font-bold text-lg">${totalAmount}</span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {isSubmitting ? '傳送中...' : '確認點餐'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
