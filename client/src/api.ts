import { supabase } from './lib/supabase';
import type { MenuItem, Category, Order, Table, OrderItem } from './types';
import { v4 as uuidv4 } from 'uuid';

// Supabase returns loosely-typed rows whose columns may be snake_case (from the
// database) or camelCase (from realtime payloads), so the mappers accept a
// generic record and normalise it into our domain types.
type Row = Record<string, unknown>;

// Helper to convert Supabase row to Order type
export const toOrder = (row: Row): Order => ({
  id: row.id as string,
  tableId: (row.tableid ?? row.tableId) as number,
  items: Array.isArray(row.items)
    ? (row.items as OrderItem[])
    : (row.items ? (JSON.parse(row.items as string) as OrderItem[]) : []),
  totalPrice: (row.totalprice ?? row.totalPrice) as number,
  status: row.status as Order['status'],
  paymentStatus: (row.paymentstatus ?? row.paymentStatus) as Order['paymentStatus'],
  paymentMethod: (row.paymentmethod ?? row.paymentMethod) as string | undefined,
  createdAt: (row.createdat ?? row.createdAt) as string
});

// Helper to convert Supabase row to Category type
const toCategory = (row: Row): Category => ({
  id: row.id as string,
  name: row.name as string,
  orderIndex: (row.order_index ?? row.orderIndex ?? 0) as number
});

// Helper to convert Supabase row to MenuItem type
const toMenuItem = (row: Row): MenuItem => ({
  id: row.id as string,
  categoryId: (row.categoryid ?? row.categoryId) as string,
  name: row.name as string,
  price: row.price as number,
  image: row.image as string,
  description: row.description as string
});

export const api = {
  // Auth — handled by the Netlify Function backed by Netlify Database, so the
  // admin gate no longer depends on Supabase Auth (which requires email
  // confirmation and cannot be self-provisioned from the browser).
  login: async (email: string, password: string) => {
    const res = await fetch('/.netlify/functions/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password })
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (res.ok && data.success && data.user) {
      return { success: true, user: { id: data.user.id, email: data.user.email } };
    }
    return { success: false, error: data.error as string | undefined };
  },

  updateCredentials: async (
    email: string,
    password: string,
    newEmail: string,
    newPassword: string
  ) => {
    const res = await fetch('/.netlify/functions/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-credentials', email, password, newEmail, newPassword })
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (res.ok && data.success && data.user) {
      return { success: true, user: { id: data.user.id, email: data.user.email } };
    }
    return { success: false, error: data.error as string | undefined };
  },

  logout: async () => {
    // The admin gate is tracked client-side; clearing it happens in the caller.
  },

  // Init data
  getInitData: async () => {
    const [categoriesRes, menuItemsRes, tablesRes] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase.from('menu_items').select('*'),
      supabase.from('tables').select('*').order('id', { ascending: true })
    ]);

    if (categoriesRes.error || menuItemsRes.error || tablesRes.error) {
      throw new Error('Failed to load data');
    }

    const categories = (categoriesRes.data || [])
      .map(toCategory)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const menuItems = (menuItemsRes.data || []).map(toMenuItem);
    const tables = tablesRes.data || [];

    return { categories, menuItems, tables };
  },

  // Orders
  getOrders: async (): Promise<Order[]> => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('createdat', { ascending: true });
    
    if (error) throw new Error('Failed to load orders');
    return (data || []).map(toOrder);
  },

  createOrder: async (orderData: { tableId: number; items: OrderItem[]; totalPrice: number }): Promise<Order> => {
    const normalizedItems = orderData.items.map(item => ({
      ...item,
      completedQty: item.completedQty ?? 0
    }));
    const computedTotal = normalizedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    
    const newOrder = {
      id: uuidv4(),
      tableid: orderData.tableId,
      items: normalizedItems,
      totalprice: computedTotal || orderData.totalPrice || 0,
      status: 'pending',
      paymentstatus: 'unpaid',
      paymentmethod: null,
      createdat: new Date().toISOString()
    };

    const { error } = await supabase.from('orders').insert(newOrder);
    if (error) throw new Error('Failed to create order');

    // Update table status
    await supabase.from('tables').update({ status: 'occupied' }).eq('id', orderData.tableId);

    return toOrder(newOrder);
  },

  updateOrderStatus: async (orderId: string, status: string): Promise<Order> => {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select('*')
      .single();
    
    if (error) throw new Error('Failed to update order status');
    return toOrder(data);
  },

  updateOrderItems: async (orderId: string, items: OrderItem[]): Promise<Order | { deleted: boolean }> => {
    // Get current order first
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (fetchError || !order) throw new Error('Order not found');

    const existingItems = Array.isArray(order.items) ? order.items : [];
    const mergedItems = items.map(item => {
      const existing = existingItems.find((e: OrderItem) => e.id === item.id);
      const completedQty = existing ? Math.min(existing.completedQty || 0, item.qty) : 0;
      return { ...item, completedQty };
    });

    const totalPrice = mergedItems.reduce((sum, item) => sum + item.price * item.qty, 0);

    if (mergedItems.length === 0) {
      await supabase.from('orders').delete().eq('id', orderId);
      
      // Check if table has other unpaid orders
      const { data: unpaid } = await supabase
        .from('orders')
        .select('id')
        .eq('tableid', order.tableid)
        .eq('paymentstatus', 'unpaid');
      
      if (!unpaid || unpaid.length === 0) {
        await supabase.from('tables').update({ status: 'available' }).eq('id', order.tableid);
      }
      
      return { deleted: true };
    }

    const allCompleted = mergedItems.every(item => (item.completedQty || 0) >= item.qty);
    const nextStatus = allCompleted ? 'completed' : (order.status === 'completed' ? 'preparing' : order.status);

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ items: mergedItems, totalprice: totalPrice, status: nextStatus })
      .eq('id', orderId)
      .select('*')
      .single();

    if (updateError) throw new Error('Failed to update order items');
    return toOrder(updated);
  },

  completeOrderItem: async (orderId: string, itemId: string): Promise<Order> => {
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (fetchError || !order) throw new Error('Order not found');

    const items = Array.isArray(order.items) ? order.items : [];
    const itemIndex = items.findIndex((item: OrderItem) => item.id === itemId);
    if (itemIndex === -1) throw new Error('Order item not found');

    const item = items[itemIndex];
    item.completedQty = Math.min(item.qty, (item.completedQty || 0) + 1);
    
    const allCompleted = items.every((i: OrderItem) => (i.completedQty || 0) >= i.qty);
    const nextStatus = allCompleted ? 'completed' : 'preparing';

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ items, status: nextStatus })
      .eq('id', orderId)
      .select('*')
      .single();

    if (updateError) throw new Error('Failed to complete item');
    return toOrder(updated);
  },

  checkout: async (tableId: number, paymentMethod: string) => {
    // Update all unpaid orders for this table
    const { data: unpaidOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('tableid', tableId)
      .eq('paymentstatus', 'unpaid');

    if (unpaidOrders && unpaidOrders.length > 0) {
      for (const order of unpaidOrders) {
        await supabase
          .from('orders')
          .update({ paymentstatus: 'paid', paymentmethod: paymentMethod })
          .eq('id', order.id);
      }
    }

    // Reset table status
    await supabase.from('tables').update({ status: 'available' }).eq('id', tableId);

    return { success: true, message: `Table ${tableId} checked out with ${paymentMethod}` };
  },

  // Menu
  addMenuItem: async (item: Omit<MenuItem, 'id'>): Promise<MenuItem> => {
    const newItem = {
      id: uuidv4(),
      categoryid: item.categoryId,
      name: item.name,
      price: item.price,
      image: item.image,
      description: item.description
    };

    const { error } = await supabase.from('menu_items').insert(newItem);
    if (error) throw new Error('Failed to add menu item');
    
    return { ...item, id: newItem.id };
  },

  updateMenuItem: async (id: string, item: Omit<MenuItem, 'id'>): Promise<MenuItem> => {
    const { error } = await supabase
      .from('menu_items')
      .update({
        categoryid: item.categoryId,
        name: item.name,
        price: item.price,
        image: item.image,
        description: item.description
      })
      .eq('id', id);

    if (error) throw new Error('Failed to update menu item');
    return { ...item, id };
  },

  // Categories
  addCategory: async (name: string): Promise<Category> => {
    // Get max order_index
    const { data: existing } = await supabase.from('categories').select('order_index');
    const maxOrder = (existing || []).reduce((max, item) => Math.max(max, item.order_index || 0), 0);
    
    const newCategory = {
      id: uuidv4(),
      name: name.trim(),
      order_index: maxOrder + 1
    };

    const { error } = await supabase.from('categories').insert(newCategory);
    if (error) throw new Error('Failed to add category');
    
    return toCategory(newCategory);
  },

  updateCategory: async (id: string, name: string): Promise<Category> => {
    const { data, error } = await supabase
      .from('categories')
      .update({ name: name.trim() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update category');
    return toCategory(data);
  },

  deleteCategory: async (id: string) => {
    // Check if category has menu items
    const { data: items } = await supabase
      .from('menu_items')
      .select('id')
      .eq('categoryid', id);

    if (items && items.length > 0) {
      throw new Error('類別仍有餐點，無法刪除');
    }

    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw new Error('Failed to delete category');
    
    return { success: true };
  },

  reorderCategories: async (ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from('categories')
        .update({ order_index: i + 1 })
        .eq('id', ids[i]);
      
      if (error) throw new Error('Failed to reorder categories');
    }
    return { success: true };
  },

  // Tables
  updateTableCount: async (count: number): Promise<Table[]> => {
    const target = Math.max(0, count);
    
    const { data: tablesData, error } = await supabase
      .from('tables')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) throw new Error('Failed to load tables');

    const current = tablesData?.length || 0;
    if (target === current) return tablesData || [];

    if (target > current) {
      const maxId = tablesData && tablesData.length > 0 
        ? Math.max(...tablesData.map(t => t.id)) 
        : 0;
      const inserts = Array.from({ length: target - current }).map((_, i) => {
        const id = maxId + i + 1;
        return { id, name: `桌號 ${id}`, status: 'available', seats: 4 };
      });
      await supabase.from('tables').insert(inserts);
    } else {
      const removeIds = tablesData!.slice(current - (current - target)).map(t => t.id);
      if (removeIds.length > 0) {
        await supabase.from('tables').delete().in('id', removeIds);
        await supabase.from('orders').delete().in('tableid', removeIds);
      }
    }

    const { data: updatedTables } = await supabase
      .from('tables')
      .select('*')
      .order('id', { ascending: true });
    
    return updatedTables || [];
  },

  updateTableName: async (id: number, name: string, seats?: number): Promise<Table> => {
    const updates: { name?: string; seats?: number } = {};
    if (name) updates.name = name.trim();
    if (seats !== undefined) updates.seats = seats;

    const { data, error } = await supabase
      .from('tables')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update table');
    return data;
  }
};
