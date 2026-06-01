import { useCallback, useEffect, useRef, useState } from 'react';
import { api, toOrder } from '../api';
import { supabase } from '../lib/supabase';
import type { Category, MenuItem, Table, Order } from '../types';
import { QRCodeCanvas } from 'qrcode.react';
import { Settings, LayoutGrid, DollarSign, Plus, Coffee, LogOut } from 'lucide-react';
import clsx from 'clsx';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'pos' | 'menu' | 'revenue'>('pos');
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>('');
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const qrRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const [editingTableNameId, setEditingTableNameId] = useState<number | null>(null);
  const [editingTableName, setEditingTableName] = useState<string>('');
  const [editingTableSeats, setEditingTableSeats] = useState<number>(4);
  const [isPosEditMode, setIsPosEditMode] = useState(false);
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedDay, setSelectedDay] = useState('all');
  const [isAuthed, setIsAuthed] = useState(() => localStorage.getItem('admin_authed') === '1');
  const [loginEmail, setLoginEmail] = useState('admin@admin.com');
  const [loginPassword, setLoginPassword] = useState('adminadmin');
  const [loginError, setLoginError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('all');

  // Menu Form State
  const defaultImage = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c';
  const [newItem, setNewItem] = useState({ name: '', price: 0, categoryId: 'cat_1', description: '', image: defaultImage });
  const [imagePreview, setImagePreview] = useState<string>(defaultImage);

  const refreshData = useCallback(async () => {
    try {
      const data = await api.getInitData();
      setTables(data.tables);
      setMenuItems(data.menuItems);
      setCategories(data.categories);
      if (data.categories.length > 0) {
        setNewItem(prev => prev.categoryId ? prev : { ...prev, categoryId: data.categories[0].id });
      }
      const orderData = await api.getOrders();
      setOrders(orderData);
    } catch (err) {
      console.error("Failed to refresh data:", err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    // Initial load — kept inside an async IIFE so state updates happen after
    // the awaited fetch rather than synchronously within the effect body.
    (async () => {
      try {
        const data = await api.getInitData();
        setTables(data.tables);
        setMenuItems(data.menuItems);
        setCategories(data.categories);
        if (data.categories.length > 0) {
          setNewItem(prev => prev.categoryId ? prev : { ...prev, categoryId: data.categories[0].id });
        }
        const orderData = await api.getOrders();
        setOrders(orderData);
      } catch (err) {
        console.error("Failed to refresh data:", err);
      }
    })();

    // Subscribe to orders changes via Supabase Realtime
    const ordersChannel = supabase
      .channel('admin-orders')
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
      .subscribe();

    // Subscribe to tables changes
    const tablesChannel = supabase
      .channel('admin-tables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tables' },
        (payload) => {
          console.log('Tables change:', payload);
          // Refresh tables on any change
          api.getInitData().then(data => setTables(data.tables)).catch(console.error);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(tablesChannel);
    };
  }, [isAuthed]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await api.login(loginEmail, loginPassword);
      if (res.success && res.user) {
        localStorage.setItem('admin_authed', '1');
        localStorage.setItem('admin_user_id', res.user.id);
        localStorage.setItem('admin_email', res.user.email || '');
        setIsAuthed(true);
      } else {
        setLoginError(res.error || '帳號或密碼錯誤');
      }
    } catch (err) {
      console.error("Login failed:", err);
      setLoginError('登入失敗，請稍後再試');
    }
  };

  const openSettings = () => {
    setCurrentPassword('');
    setNewEmail(localStorage.getItem('admin_email') || '');
    setNewPassword('');
    setSettingsError('');
    setSettingsSuccess('');
    setSettingsOpen(true);
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess('');
    const email = localStorage.getItem('admin_email') || '';
    try {
      const res = await api.updateCredentials(email, currentPassword, newEmail, newPassword);
      if (res.success && res.user) {
        localStorage.setItem('admin_user_id', res.user.id);
        localStorage.setItem('admin_email', res.user.email || '');
        setSettingsSuccess('已更新管理員帳號設定');
        setCurrentPassword('');
        setNewPassword('');
      } else {
        setSettingsError(res.error || '更新失敗');
      }
    } catch (err) {
      console.error("Update credentials failed:", err);
      setSettingsError('更新失敗，請稍後再試');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    localStorage.removeItem('admin_authed');
    localStorage.removeItem('admin_user_id');
    localStorage.removeItem('admin_email');
    setIsAuthed(false);
  };

  const handleTableClick = (table: Table) => {
    setSelectedTable(table);
    setCheckoutModalOpen(true);
    if (menuItems.length > 0) {
      setSelectedMenuItemId(menuItems[0].id);
    }
  };

  const startEditTableName = (table: Table) => {
    setEditingTableNameId(table.id);
    setEditingTableName(table.name);
    setEditingTableSeats(table.seats || 4);
  };

  const cancelEditTableName = () => {
    setEditingTableNameId(null);
    setEditingTableName('');
    setEditingTableSeats(4);
  };

  const saveTableName = async () => {
    if (editingTableNameId === null) return;
    try {
      await api.updateTableName(editingTableNameId, editingTableName, editingTableSeats);
      cancelEditTableName();
      refreshData();
    } catch (err) {
      console.error("Update table name failed:", err);
      alert("更新桌名失敗");
    }
  };

  const handleTableCountChange = async (nextCount: number) => {
    const clamped = Math.max(0, nextCount);
    try {
      await api.updateTableCount(clamped);
      refreshData();
    } catch (err) {
      console.error("Update table count failed:", err);
      alert("更新桌數失敗");
    }
  };

  const downloadQrCode = (tableId: number) => {
    const canvas = qrRefs.current[tableId];
    if (!canvas) {
      alert("找不到 QR Code，請稍後再試");
      return;
    }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `table-${tableId}-qrcode.png`;
    link.click();
  };

  const handleCheckout = async (method: string) => {
    if (!selectedTable) return;
    try {
      await api.checkout(selectedTable.id, method);
      setCheckoutModalOpen(false);
      alert(`結帳成功！使用 ${method}`);
      refreshData();
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("結帳失敗，請稍後再試");
    }
  };

  const handleAddMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMenuItemId) {
        await api.updateMenuItem(editingMenuItemId, newItem);
        alert('更新菜單成功');
      } else {
        await api.addMenuItem(newItem);
        alert('新增菜單成功');
      }
      refreshData();
      setNewItem({ name: '', price: 0, categoryId: 'cat_1', description: '', image: defaultImage });
      setImagePreview(defaultImage);
      setEditingMenuItemId(null);
    } catch (err) {
      console.error("Save menu item failed:", err);
      alert(editingMenuItemId ? "更新菜單失敗" : "新增菜單失敗");
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await api.addCategory(newCategoryName.trim());
      setNewCategoryName('');
      refreshData();
    } catch (err) {
      console.error("Add category failed:", err);
      alert("新增類別失敗");
    }
  };

  const startEditCategory = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const saveCategory = async () => {
    if (!editingCategoryId || !editingCategoryName.trim()) return;
    try {
      await api.updateCategory(editingCategoryId, editingCategoryName.trim());
      cancelEditCategory();
      refreshData();
    } catch (err) {
      console.error("Update category failed:", err);
      alert("更新類別失敗");
    }
  };

  const reorderCategoryList = async (fromId: string, toId: string) => {
    const current = [...categories];
    const fromIndex = current.findIndex(c => c.id === fromId);
    const toIndex = current.findIndex(c => c.id === toId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    setCategories(current);
    try {
      await api.reorderCategories(current.map(c => c.id));
      refreshData();
    } catch (err) {
      console.error("Reorder categories failed:", err);
      alert("更新排序失敗");
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('確定要刪除此類別嗎？')) return;
    try {
      await api.deleteCategory(id);
      refreshData();
    } catch (err) {
      console.error("Delete category failed:", err);
      alert("刪除失敗：請先移除該類別下的餐點");
    }
  };

  const startEditMenuItem = (item: MenuItem) => {
    setEditingMenuItemId(item.id);
    setNewItem({
      name: item.name,
      price: item.price,
      categoryId: item.categoryId,
      description: item.description,
      image: item.image || defaultImage,
    });
    setImagePreview(item.image || defaultImage);
  };

  const cancelEditMenuItem = () => {
    setEditingMenuItemId(null);
    setNewItem({ name: '', price: 0, categoryId: 'cat_1', description: '', image: defaultImage });
    setImagePreview(defaultImage);
  };

  const handleImageChange = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : defaultImage;
      setNewItem({ ...newItem, image: result });
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const getTableTotal = (tableId: number) => {
    return orders
      .filter(o => o.tableId === tableId && o.paymentStatus === 'unpaid')
      .reduce((sum, o) => sum + o.totalPrice, 0);
  };

  const getUnpaidOrdersForTable = (tableId: number) => {
    return orders
      .filter(o => o.tableId === tableId && o.paymentStatus === 'unpaid')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  const updateOrderItems = async (orderId: string, items: Order['items']) => {
    try {
      const result = await api.updateOrderItems(orderId, items);
      if ('deleted' in result && result.deleted) {
        setOrders(prev => prev.filter(o => o.id !== orderId));
      }
      refreshData();
    } catch (err) {
      console.error("Update order items failed:", err);
      alert("更新點餐內容失敗");
    }
  };

  const adjustItemQty = (order: Order, itemId: string, delta: number) => {
    const nextItems = order.items
      .map(item => item.id === itemId ? { ...item, qty: item.qty + delta } : item)
      .filter(item => item.qty > 0);
    updateOrderItems(order.id, nextItems);
  };

  const addItemToOrder = async (menuItemId: string) => {
    if (!selectedTable) return;
    const menuItem = menuItems.find(m => m.id === menuItemId);
    if (!menuItem) return;

    const unpaidOrders = getUnpaidOrdersForTable(selectedTable.id);
    const targetOrder = unpaidOrders[unpaidOrders.length - 1];

    if (!targetOrder) {
      try {
        await api.createOrder({
          tableId: selectedTable.id,
          items: [{ id: menuItem.id, name: menuItem.name, qty: 1, price: menuItem.price }],
          totalPrice: menuItem.price
        });
        refreshData();
      } catch (err) {
        console.error("Create order failed:", err);
        alert("新增點餐失敗");
      }
      return;
    }

    const existing = targetOrder.items.find(item => item.id === menuItem.id);
    const nextItems = existing
      ? targetOrder.items.map(item => item.id === menuItem.id ? { ...item, qty: item.qty + 1 } : item)
      : [...targetOrder.items, { id: menuItem.id, name: menuItem.name, qty: 1, price: menuItem.price }];

    updateOrderItems(targetOrder.id, nextItems);
  };

  const totalRevenue = orders
    .filter(o => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + o.totalPrice, 0);

  const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
  const years = Array.from(new Set(paidOrders.map(o => new Date(o.createdAt).getFullYear()))).sort((a, b) => b - a);
  const filteredByYear = selectedYear === 'all'
    ? paidOrders
    : paidOrders.filter(o => new Date(o.createdAt).getFullYear().toString() === selectedYear);
  const months = Array.from(new Set(filteredByYear.map(o => (new Date(o.createdAt).getMonth() + 1)))).sort((a, b) => a - b);
  const filteredByMonth = selectedMonth === 'all'
    ? filteredByYear
    : filteredByYear.filter(o => (new Date(o.createdAt).getMonth() + 1).toString() === selectedMonth);
  const days = Array.from(new Set(filteredByMonth.map(o => new Date(o.createdAt).getDate()))).sort((a, b) => a - b);
  const filteredOrders = selectedDay === 'all'
    ? filteredByMonth
    : filteredByMonth.filter(o => new Date(o.createdAt).getDate().toString() === selectedDay);

  const revenueTotal = filteredOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const revenueByMethod = filteredOrders.reduce((acc, o) => {
    const method = o.paymentMethod || 'unknown';
    acc[method] = (acc[method] || 0) + o.totalPrice;
    return acc;
  }, {} as Record<string, number>);

  const selectedTableOrders = selectedTable ? getUnpaidOrdersForTable(selectedTable.id) : [];

  if (!isAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow max-w-md w-full">
          <h2 className="text-2xl font-bold mb-6 text-center">管理後台登入</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">密碼</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>
            {loginError && (
              <div className="text-red-600 text-sm">{loginError}</div>
            )}
            <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded hover:bg-slate-800 font-bold">
              登入
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white p-6 flex flex-col">
        <h1 className="text-2xl font-bold mb-8 flex items-center gap-2">
          <Settings /> 管理後台
        </h1>
        <div className="mb-8 bg-slate-800 p-4 rounded-lg">
          <p className="text-slate-400 text-sm mb-1">今日總營收</p>
          <p className="text-2xl font-bold text-green-400">${totalRevenue}</p>
        </div>
        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => setActiveTab('pos')}
            className={clsx("w-full text-left p-3 rounded flex items-center gap-2", activeTab === 'pos' ? "bg-slate-700" : "hover:bg-slate-800")}
          >
            <LayoutGrid size={20} /> POS 桌況
          </button>
          <button 
            onClick={() => setActiveTab('menu')}
            className={clsx("w-full text-left p-3 rounded flex items-center gap-2", activeTab === 'menu' ? "bg-slate-700" : "hover:bg-slate-800")}
          >
            <Coffee size={20} /> 菜單管理
          </button>
          <button 
            onClick={() => setActiveTab('revenue')}
            className={clsx("w-full text-left p-3 rounded flex items-center gap-2", activeTab === 'revenue' ? "bg-slate-700" : "hover:bg-slate-800")}
          >
            <DollarSign size={20} /> 營收統計
          </button>
        </nav>
        <button
          onClick={openSettings}
          className="w-full text-left p-3 rounded flex items-center gap-2 hover:bg-slate-800 text-slate-400"
        >
          <Settings size={20} /> 帳號設定
        </button>
        <button
          onClick={handleLogout}
          className="w-full text-left p-3 rounded flex items-center gap-2 hover:bg-slate-800 text-slate-400"
        >
          <LogOut size={20} /> 登出
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        {activeTab === 'pos' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">桌位即時狀況</h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">編輯模式</span>
                <button
                  onClick={() => setIsPosEditMode(prev => !prev)}
                  className={clsx(
                    "px-3 py-1 rounded border text-sm",
                    isPosEditMode ? "bg-slate-900 text-white border-slate-900" : "hover:bg-gray-50"
                  )}
                >
                  {isPosEditMode ? "已開啟" : "開啟"}
                </button>
              </div>
            </div>
            {isPosEditMode && (
              <div className="mb-4 flex items-center gap-3">
                <span className="text-sm text-gray-500">桌數</span>
                <button
                  onClick={() => handleTableCountChange(tables.length - 1)}
                  className="w-8 h-8 rounded border hover:bg-gray-50"
                >
                  -
                </button>
                <span className="min-w-[24px] text-center font-bold">{tables.length}</span>
                <button
                  onClick={() => handleTableCountChange(tables.length + 1)}
                  className="w-8 h-8 rounded border hover:bg-gray-50"
                >
                  +
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {tables.map(table => {
                const total = getTableTotal(table.id);
                const isOccupied = table.status === 'occupied' || total > 0;
                const seats = table.seats || 4;
                
                return (
                  <div 
                    key={table.id}
                    onClick={() => handleTableClick(table)}
                    className={clsx(
                      "cursor-pointer rounded-xl p-5 min-h-[220px] flex flex-col gap-4 shadow transition-all hover:scale-[1.02]",
                      isOccupied ? "bg-orange-50 border-2 border-orange-500" : "bg-white border-2 border-gray-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-700">{table.name}</h3>
                        <div className="text-xs text-gray-500">{seats} 人座</div>
                      </div>
                      <span className={clsx("px-2 py-1 rounded text-xs font-bold", isOccupied ? "bg-orange-200 text-orange-800" : "bg-green-100 text-green-800")}>
                        {isOccupied ? '用餐中' : '空桌'}
                      </span>
                    </div>
                    {isPosEditMode && (
                      <div className="bg-white/70 border rounded-lg p-3">
                        {editingTableNameId === table.id ? (
                          <div className="space-y-2">
                            <input
                              value={editingTableName}
                              onChange={(e) => setEditingTableName(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full border rounded px-2 py-1 text-sm"
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">人數</span>
                              <input
                                type="number"
                                min={1}
                                value={editingTableSeats}
                                onChange={(e) => setEditingTableSeats(parseInt(e.target.value) || 1)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-20 border rounded px-2 py-1 text-sm"
                              />
                              <div className="ml-auto flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveTableName();
                                  }}
                                  className="text-xs border rounded px-2 py-1 hover:bg-white"
                                >
                                  儲存
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditTableName();
                                  }}
                                  className="text-xs border rounded px-2 py-1 hover:bg-white"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditTableName(table);
                            }}
                            className="text-xs border rounded px-2 py-1 hover:bg-white"
                          >
                            編輯桌名
                          </button>
                        )}
                      </div>
                    )}
                    
                    {isOccupied ? (
                      <div>
                        <div className="text-sm text-gray-500 mb-1">未結金額</div>
                        <div className="text-3xl font-bold text-orange-600">${total}</div>
                        {isPosEditMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadQrCode(table.id);
                            }}
                            className="mt-3 w-full text-sm border rounded py-2 hover:bg-white"
                          >
                            下載 QR Code
                          </button>
                        )}
                      </div>
                    ) : (
                       <div className="text-center opacity-60">
                         <QRCodeCanvas
                           value={`${window.location.origin}/table/${table.id}`}
                           size={92}
                           ref={el => { qrRefs.current[table.id] = el; }}
                         />
                         <p className="text-xs mt-2">掃描點餐</p>
                         {isPosEditMode && (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               downloadQrCode(table.id);
                             }}
                             className="mt-2 w-full text-xs border rounded py-1 hover:bg-white"
                           >
                             下載 QR Code
                           </button>
                         )}
                       </div>
                    )}
                    {isOccupied && (
                      <div className="hidden">
                        <QRCodeCanvas
                          value={`${window.location.origin}/table/${table.id}`}
                          size={80}
                          ref={el => { qrRefs.current[table.id] = el; }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">營收統計</h2>
            <div className="bg-white p-6 rounded-xl shadow space-y-6">
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">年</label>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(e.target.value)}
                    className="border rounded p-2"
                  >
                    <option value="all">全部</option>
                    {years.map(y => (
                      <option key={y} value={y.toString()}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">月</label>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="border rounded p-2"
                  >
                    <option value="all">全部</option>
                    {months.map(m => (
                      <option key={m} value={m.toString()}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">日</label>
                  <select
                    value={selectedDay}
                    onChange={e => setSelectedDay(e.target.value)}
                    className="border rounded p-2"
                  >
                    <option value="all">全部</option>
                    {days.map(d => (
                      <option key={d} value={d.toString()}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="text-sm text-gray-500">總收入</div>
                <div className="text-3xl font-bold text-green-600">${revenueTotal}</div>
              </div>

              <div>
                <h3 className="text-lg font-bold mb-3">支付方式分項</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-gray-500">LINE Pay</div>
                    <div className="text-xl font-bold">${revenueByMethod.linepay || 0}</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-gray-500">街口支付</div>
                    <div className="text-xl font-bold">${revenueByMethod.jkopay || 0}</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-gray-500">現金</div>
                    <div className="text-xl font-bold">${revenueByMethod.cash || 0}</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-gray-500">其他</div>
                    <div className="text-xl font-bold">${revenueByMethod.unknown || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'menu' && (
          <div className="flex gap-8">
            {/* Menu List */}
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">菜單列表</h2>
              {/* Category Tabs */}
              <div className="flex gap-2 mb-6 flex-wrap">
                <button
                  onClick={() => setSelectedMenuCategory('all')}
                  className={clsx(
                    "px-4 py-2 rounded-full text-sm font-medium transition",
                    selectedMenuCategory === 'all'
                      ? "bg-slate-900 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  全部
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedMenuCategory(cat.id)}
                    className={clsx(
                      "px-4 py-2 rounded-full text-sm font-medium transition",
                      selectedMenuCategory === cat.id
                        ? "bg-slate-900 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {menuItems
                  .filter(item => selectedMenuCategory === 'all' || item.categoryId === selectedMenuCategory)
                  .map(item => (
                  <div
                    key={item.id}
                    onClick={() => startEditMenuItem(item)}
                    className={clsx(
                      "bg-white p-4 rounded-lg shadow flex items-center gap-4 cursor-pointer border",
                      editingMenuItemId === item.id ? "border-slate-900" : "border-transparent hover:border-slate-300"
                    )}
                  >
                    <img src={item.image} alt={item.name} className="w-16 h-16 rounded object-cover" />
                    <div className="flex-1">
                      <h3 className="font-bold">{item.name}</h3>
                      <p className="text-sm text-gray-500">${item.price}</p>
                      <p className="text-xs text-gray-400">{categories.find(c => c.id === item.categoryId)?.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-96 space-y-6">
              {/* Add Item Form */}
              <div className="bg-white p-6 rounded-xl shadow h-fit">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Plus /> {editingMenuItemId ? "編輯餐點" : "新增餐點"}
                </h3>
                <form onSubmit={handleAddMenuItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">名稱</label>
                  <input 
                    type="text" 
                    value={newItem.name}
                    onChange={e => setNewItem({...newItem, name: e.target.value})}
                    className="w-full border rounded p-2"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">價格</label>
                  <input 
                    type="number" 
                    value={newItem.price}
                    onChange={e => setNewItem({...newItem, price: parseInt(e.target.value)})}
                    className="w-full border rounded p-2"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">類別</label>
                  <select 
                    value={newItem.categoryId}
                    onChange={e => setNewItem({...newItem, categoryId: e.target.value})}
                    className="w-full border rounded p-2"
                  >
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">餐點圖片</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleImageChange(e.target.files?.[0] || null)}
                    className="w-full border rounded p-2"
                  />
                  <div className="mt-3">
                    <img
                      src={imagePreview}
                      alt="預覽"
                      className="w-full h-32 object-cover rounded border"
                    />
                  </div>
                </div>
                 <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">描述</label>
                  <textarea 
                    value={newItem.description}
                    onChange={e => setNewItem({...newItem, description: e.target.value})}
                    className="w-full border rounded p-2"
                  />
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="flex-1 bg-slate-900 text-white py-2 rounded hover:bg-slate-800 font-bold">
                    {editingMenuItemId ? "更新" : "新增"}
                  </button>
                  {editingMenuItemId && (
                    <button
                      type="button"
                      onClick={cancelEditMenuItem}
                      className="flex-1 border py-2 rounded hover:bg-gray-50 font-bold"
                    >
                      取消
                    </button>
                  )}
                </div>
                </form>
              </div>

              {/* Category Manager */}
              <div className="bg-white p-6 rounded-xl shadow h-fit">
                <h3 className="text-xl font-bold mb-4">類別管理</h3>
                <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="新增類別名稱"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    className="flex-1 border rounded p-2"
                  />
                  <button type="submit" className="bg-slate-900 text-white px-3 rounded hover:bg-slate-800">
                    新增
                  </button>
                </form>
                <div className="space-y-2">
                  {categories.map(category => (
                    <div
                      key={category.id}
                      className="flex items-center gap-2 border rounded p-2"
                      draggable
                      onDragStart={() => setDraggingCategoryId(category.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (draggingCategoryId) {
                          reorderCategoryList(draggingCategoryId, category.id);
                        }
                        setDraggingCategoryId(null);
                      }}
                    >
                      {editingCategoryId === category.id ? (
                        <>
                          <input
                            value={editingCategoryName}
                            onChange={e => setEditingCategoryName(e.target.value)}
                            className="flex-1 border rounded p-1 text-sm"
                          />
                          <button
                            type="button"
                            onClick={saveCategory}
                            className="text-xs border rounded px-2 py-1"
                          >
                            儲存
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditCategory}
                            className="text-xs border rounded px-2 py-1"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm">{category.name}</span>
                          <button
                            type="button"
                            onClick={() => startEditCategory(category)}
                            className="text-xs border rounded px-2 py-1"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCategory(category.id)}
                            className="text-xs border rounded px-2 py-1 text-red-600"
                          >
                            刪除
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {checkoutModalOpen && selectedTable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">{selectedTable.name} 結帳</h2>

            <div className="mb-6">
              <p className="text-gray-500">待結帳總金額</p>
              <p className="text-4xl font-bold text-orange-600">${getTableTotal(selectedTable.id)}</p>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-bold mb-3">已點餐點</h3>
              {selectedTableOrders.length === 0 && (
                <div className="text-gray-500 text-sm">尚無點餐</div>
              )}
              <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                {selectedTableOrders.map(order => (
                  <div key={order.id} className="border rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-2">
                      訂單時間：{new Date(order.createdAt).toLocaleString()}
                    </div>
                    {order.items.length === 0 ? (
                      <div className="text-gray-400 text-sm">訂單無餐點</div>
                    ) : (
                      <div className="space-y-2">
                        {order.items.map(item => {
                          const completedQty = item.completedQty ?? 0;
                          const isDone = completedQty >= item.qty;
                          return (
                          <div key={item.id} className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-gray-500">${item.price} / 份</div>
                              <div className="text-xs text-gray-500">
                                完成進度：{completedQty}/{item.qty}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={clsx(
                                "text-xs px-2 py-1 rounded",
                                isDone ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                              )}>
                                {isDone ? "已完成" : "未完成"}
                              </span>
                              <button
                                onClick={() => adjustItemQty(order, item.id, -1)}
                                className="w-8 h-8 rounded border text-gray-600 hover:bg-gray-50"
                              >
                                -
                              </button>
                              <span className="min-w-[24px] text-center font-bold">{item.qty}</span>
                              <button
                                onClick={() => adjustItemQty(order, item.id, 1)}
                                className="w-8 h-8 rounded border text-gray-600 hover:bg-gray-50"
                              >
                                +
                              </button>
                              <button
                                onClick={() => updateOrderItems(order.id, order.items.filter(i => i.id !== item.id))}
                                className="w-8 h-8 rounded border text-red-600 hover:bg-red-50"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-bold mb-3">新增點餐</h3>
              <div className="flex gap-3">
                <select
                  value={selectedMenuItemId}
                  onChange={e => setSelectedMenuItemId(e.target.value)}
                  className="flex-1 border rounded p-2"
                >
                  {menuItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} (${item.price})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => addItemToOrder(selectedMenuItemId)}
                  className="bg-slate-900 text-white px-4 rounded hover:bg-slate-800"
                >
                  加入
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <button onClick={() => handleCheckout('linepay')} className="w-full p-4 border rounded-lg flex items-center gap-3 hover:bg-green-50 border-green-200">
                <div className="bg-green-500 text-white w-8 h-8 rounded flex items-center justify-center font-bold">L</div>
                <span className="font-bold text-lg">LINE Pay</span>
              </button>
              <button onClick={() => handleCheckout('jkopay')} className="w-full p-4 border rounded-lg flex items-center gap-3 hover:bg-red-50 border-red-200">
                <div className="bg-red-500 text-white w-8 h-8 rounded flex items-center justify-center font-bold">J</div>
                <span className="font-bold text-lg">街口支付</span>
              </button>
              <button onClick={() => handleCheckout('cash')} className="w-full p-4 border rounded-lg flex items-center gap-3 hover:bg-gray-50">
                <div className="bg-gray-500 text-white w-8 h-8 rounded flex items-center justify-center font-bold"><DollarSign size={16}/></div>
                <span className="font-bold text-lg">現金付款</span>
              </button>
            </div>

            <button 
              onClick={() => setCheckoutModalOpen(false)}
              className="mt-6 w-full py-2 text-gray-500 hover:text-gray-800"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {/* Account Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl max-w-md w-full">
            <h2 className="text-2xl font-bold mb-1">帳號設定</h2>
            <p className="text-sm text-gray-500 mb-4">
              變更管理員登入 Email 或密碼。需輸入目前密碼以確認身分。
            </p>
            <form onSubmit={handleUpdateCredentials} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">目前密碼</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full border rounded p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">新的 Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full border rounded p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  新密碼 <span className="font-normal text-gray-400">（留空則不變更）</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full border rounded p-2"
                  placeholder="至少 4 個字元"
                />
              </div>
              {settingsError && <div className="text-red-600 text-sm">{settingsError}</div>}
              {settingsSuccess && <div className="text-green-600 text-sm">{settingsSuccess}</div>}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-slate-900 text-white py-2 rounded hover:bg-slate-800 font-bold">
                  儲存
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="flex-1 border py-2 rounded hover:bg-gray-50 font-bold"
                >
                  關閉
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
