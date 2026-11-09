import { create } from 'zustand';
import { Socket } from 'socket.io-client';

export interface WaiterCall {
  id: string;
  tableNumber: string;
  calledAt: string;
  restaurantId?: string;
  type?: 'default' | 'payment' | 'addons';
  amount?: number;
  paymentMethod?: string;
  itemsSummary?: string;
  orderId?: string;
  purpose?: string;
  customNote?: string;
}

export interface LiveOrderAlert {
  id: string;
  guestName?: string;
  tableNumber?: string | number;
  total?: number;
  status?: string;
  paymentMethod?: string;
  createdAt?: string;
  items?: Array<{ name?: string; menuItem?: { name?: string }; quantity: number; subtotal?: number; unitPrice?: number }>;
  user?: { name?: string };
}

export interface GeneralNotificationAlert {
  id: string;
  title: string;
  message?: string;
  type?: string;
  createdAt?: string;
}

interface WaiterState {
  waiterCalls: WaiterCall[];
  newOrders: LiveOrderAlert[];
  activeWaiterAlert: WaiterCall | null;
  activeNewOrderAlert: LiveOrderAlert | null;
  activeGeneralNotificationAlert: GeneralNotificationAlert | null;
  handledTables: string[];
  socket: Socket | null;
  soundEnabled: boolean;
  addWaiterCall: (call: Omit<WaiterCall, 'id'>, showAlert?: boolean) => void;
  removeWaiterCall: (id: string) => void;
  dismissWaiterCall: (id: string, tableNumber?: string) => void;
  addNewOrder: (order: LiveOrderAlert) => void;
  removeNewOrder: (id: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setActiveWaiterAlert: (alert: WaiterCall | null) => void;
  setActiveNewOrderAlert: (alert: LiveOrderAlert | null) => void;
  setActiveGeneralNotificationAlert: (alert: GeneralNotificationAlert | null) => void;
  clearAll: () => void;
  setSocket: (socket: Socket | null) => void;
}

export const useWaiterStore = create<WaiterState>((set) => ({
  waiterCalls: [],
  newOrders: [],
  activeWaiterAlert: null,
  activeNewOrderAlert: null,
  activeGeneralNotificationAlert: null,
  handledTables: [],
  socket: null,
  soundEnabled: true,

  addWaiterCall: (payload, showAlert = false) => {
    const cleanTable = String(payload.tableNumber).trim();
    const newCall: WaiterCall = {
      ...payload,
      tableNumber: cleanTable,
      id: `${cleanTable}-${Date.now()}`,
    };
    set((state) => {
      const updatedCalls = [newCall, ...state.waiterCalls.filter((c) => c.tableNumber !== cleanTable)];
      const updatedHandled = state.handledTables.filter((t) => t !== cleanTable);
      return {
        waiterCalls: updatedCalls,
        handledTables: updatedHandled,
        activeWaiterAlert: showAlert ? newCall : state.activeWaiterAlert,
      };
    });
  },

  removeWaiterCall: (id) =>
    set((state) => ({
      waiterCalls: state.waiterCalls.filter((c) => c.id !== id),
      activeWaiterAlert: state.activeWaiterAlert?.id === id ? null : state.activeWaiterAlert,
    })),

  dismissWaiterCall: (id, tableNumber) =>
    set((state) => {
      const cleanT = tableNumber ? String(tableNumber).trim() : null;
      return {
        waiterCalls: state.waiterCalls.filter((c) => c.id !== id && (cleanT ? c.tableNumber !== cleanT : true)),
        activeWaiterAlert:
          state.activeWaiterAlert?.id === id || (cleanT && state.activeWaiterAlert?.tableNumber === cleanT)
            ? null
            : state.activeWaiterAlert,
        handledTables: cleanT && !state.handledTables.includes(cleanT) ? [...state.handledTables, cleanT] : state.handledTables,
      };
    }),

  addNewOrder: (order) =>
    set((state) => ({
      newOrders: [order, ...state.newOrders.filter((o) => o.id !== order.id)],
      activeNewOrderAlert: order,
    })),

  removeNewOrder: (id) =>
    set((state) => ({
      newOrders: state.newOrders.filter((o) => o.id !== id),
      activeNewOrderAlert: state.activeNewOrderAlert?.id === id ? null : state.activeNewOrderAlert,
    })),

  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setActiveWaiterAlert: (activeWaiterAlert) => set({ activeWaiterAlert }),
  setActiveNewOrderAlert: (activeNewOrderAlert) => set({ activeNewOrderAlert }),
  setActiveGeneralNotificationAlert: (activeGeneralNotificationAlert) => set({ activeGeneralNotificationAlert }),
  clearAll: () => set({ waiterCalls: [], newOrders: [], activeWaiterAlert: null, activeNewOrderAlert: null, activeGeneralNotificationAlert: null, handledTables: [] }),
  setSocket: (socket) => set({ socket }),
}));
