import { useEffect, useState } from 'react';
import { api, toOrder } from '../api';
import { supabase } from '../lib/supabase';
import type { Order } from '../types';
import clsx from 'clsx';
import { ChefHat, CheckCircle, Clock, Wifi, WifiOff, type LucideIcon } from 'lucide-react';

interface ColumnProps {
  title: string;
  status: Order['status'];
  icon: LucideIcon;
  colorClass: string;
  orders: Order[];
  onUpdateStatus: (orderId: string, status: 'preparing' | 'completed') => void;
  onCompleteItem: (orderId: string, itemId: string) => void;
}

function Column({ title, status, icon: Icon, colorClass, orders, onUpdateStatus, onCompleteItem }: ColumnProps) {
  // Only show unpaid orders - paid orders should be removed after checkout
  const colOrders = orders.filter(o => o.status === status && o.paymentStatus !== 'paid');

  return (
    <div className="flex-1 min-w-[300px] bg-gray-50 rounded-xl p-4 flex flex-col h-[calc(100vh-100px)]">
      <div className={clsx("flex items-center gap-2 mb-4 pb-2 border-b-2", colorClass)}>
        <Icon className="w-6 h-6" />
        <h2 className="font-bold text-lg">{title} ({colOrders.length})</h2>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {colOrders.map(order => (
          <div key={order.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-lg bg-gray-100 px-2 py-1 rounded">桌號 {order.tableId}</span>
              <span className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleTimeString()}</span>
            </div>

            <ul className="space-y-2 mb-4">
              {order.items.map((item) => {
                const completedQty = item.completedQty ?? 0;
                const isDone = completedQty >= item.qty;
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-gray-700">
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-500">
                        {completedQty}/{item.qty} 份
                      </div>
                    </div>
                    {status === 'preparing' && (
                      <button
                        onClick={() => onCompleteItem(order.id, item.id)}
                        disabled={isDone}
                        className={clsx(
                          "px-3 py-1 rounded border text-sm font-medium",
                          isDone ? "bg-green-50 text-green-600 border-green-200" : "hover:bg-gray-50"
                        )}
                      >
                        {isDone ? "已完成" : "完成"}
                      </button>
                    )}
                    {status !== 'preparing' && (
                      <span className="font-medium">x{item.qty}</span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="flex gap-2 mt-2">
              {status === 'pending' && (
                <button
                  onClick={() => onUpdateStatus(order.id, 'preparing')}
                  className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 font-medium transition-colors"
                >
                  開始製作
                </button>
              )}
               {status === 'completed' && (
                 <div className="w-full text-center text-green-600 font-bold py-2 bg-green-50 rounded-lg">
                   已完成
                 </div>
               )}
            </div>
          </div>
        ))}
        {colOrders.length === 0 && (
          <div className="text-center text-gray-400 mt-10">目前無訂單</div>
        )}
      </div>
    </div>
  );
}

export default function KitchenDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initial fetch
    (async () => {
      try {
        const data = await api.getOrders();
        setOrders(data);
      } catch (err) {
        console.error("Failed to load orders:", err);
      }
    })();

    // Subscribe to orders changes via Supabase Realtime
    const ordersChannel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('Orders change:', payload);

          if (payload.eventType === 'INSERT') {
            const newOrder = toOrder(payload.new);
            setOrders(prev => [...prev, newOrder]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedOrder = toOrder(payload.new);
            setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setOrders(prev => prev.filter(o => o.id !== deletedId));
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Cleanup
    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  const updateStatus = async (orderId: string, status: 'preparing' | 'completed') => {
    try {
      const updated = await api.updateOrderStatus(orderId, status);
      // Update local state immediately for better UX
      setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("更新狀態失敗，請檢查網路連線");
    }
  };

  const completeItem = async (orderId: string, itemId: string) => {
    try {
      const updated = await api.completeOrderItem(orderId, itemId);
      // Update local state immediately for better UX
      setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
    } catch (err) {
      console.error("Failed to complete item:", err);
      alert("完成餐點失敗，請檢查網路連線");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ChefHat /> 廚房接單系統
        </h1>
        <div className={clsx(
          "text-sm flex items-center gap-1",
          isConnected ? "text-green-600" : "text-red-500"
        )}>
          {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
          {isConnected ? "即時連線中" : "連線中斷"}
        </div>
      </header>

      <div className="flex gap-6 overflow-x-auto pb-4">
        <Column
          title="接單中"
          status="pending"
          icon={Clock}
          colorClass="border-blue-500 text-blue-600"
          orders={orders}
          onUpdateStatus={updateStatus}
          onCompleteItem={completeItem}
        />
        <Column
          title="製作中"
          status="preparing"
          icon={ChefHat}
          colorClass="border-orange-500 text-orange-600"
          orders={orders}
          onUpdateStatus={updateStatus}
          onCompleteItem={completeItem}
        />
        <Column
          title="已完成"
          status="completed"
          icon={CheckCircle}
          colorClass="border-green-500 text-green-600"
          orders={orders}
          onUpdateStatus={updateStatus}
          onCompleteItem={completeItem}
        />
      </div>
    </div>
  );
}
