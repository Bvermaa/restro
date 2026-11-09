'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UtensilsCrossed, LayoutDashboard, ShoppingBag, Tag, BarChart3, Settings, LogOut,
  Menu, Plus, Trash2, Edit2, Eye, EyeOff, Image, Leaf, X, Check, ChevronDown, ChevronRight, Palette, Sparkles, Star,
  FileUp, UploadCloud, Layers, FolderPlus, DollarSign, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { WaiterBell } from '@/components/owner/WaiterBell';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';

function getOwnerFallbackFoodImage(name: string, isVeg: boolean): string {
  const lower = name.toLowerCase();
  if (lower.includes('paneer')) return 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('chicken')) return 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('naan') || lower.includes('roti') || lower.includes('bread')) return 'https://images.unsplash.com/photo-1626074353765-517a681e40be?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('biryani') || lower.includes('rice')) return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('jamun') || lower.includes('dessert') || lower.includes('sweet')) return 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('lassi') || lower.includes('drink') || lower.includes('mango')) return 'https://images.unsplash.com/photo-1546173159-315724a31696?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('pizza')) return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800&auto=format&fit=crop';
  if (lower.includes('burger')) return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=800&auto=format&fit=crop';
  return isVeg
    ? 'https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=800&auto=format&fit=crop'
    : 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?q=80&w=800&auto=format&fit=crop';
}

type VariantItem = { id?: string; name: string; price: number | string };
type AddOnItem = { id?: string; name: string; price: number | string };

type Category = {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  parent?: { id: string; name: string } | null;
  subcategories?: Category[];
  _count: { items: number };
};

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  image: string | null;
  isVeg: boolean;
  isVegan: boolean;
  isAvailable: boolean;
  badges: string[];
  variants: VariantItem[];
  addOns: AddOnItem[];
  category: { name: string };
};

type ParsedExtractedItem = {
  name: string;
  description?: string;
  price: number;
  categoryName: string;
  parentCategoryName?: string;
  isVeg: boolean;
  isVegan: boolean;
  variants: Array<{ name: string; price: number }>;
  addOns: Array<{ name: string; price: number }>;
};

export function OwnerMenuPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const qc = useQueryClient();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Add/Edit item modal
  const [showAddItem, setShowAddItem] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    isVeg: true,
    isAvailable: true,
    image: null as File | null,
    variants: [] as VariantItem[],
    addOns: [] as AddOnItem[],
  });

  // Category creation
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [parentCategorySelect, setParentCategorySelect] = useState<string>('');

  // Menu Upload & Visualizer AI Auto-Fill Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsingLoading, setParsingLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedMenu, setExtractedMenu] = useState<{
    categories: Array<{ name: string; parentName?: string }>;
    items: ParsedExtractedItem[];
  } | null>(null);
  const [importingLoading, setImportingLoading] = useState(false);

  const [previewVersion, setPreviewVersion] = useState(0);

  const { data: restaurantData } = useQuery({
    queryKey: ['owner-restaurant'],
    queryFn: async () => {
      const res = await api.get('/owner/restaurant');
      return res.data.data.restaurant as { slug: string; themeColor: string | null };
    },
  });

  const { data: catData } = useQuery({
    queryKey: ['owner-categories'],
    queryFn: async () => {
      const res = await api.get('/owner/menu/categories');
      return res.data.data.categories as Category[];
    },
  });

  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['owner-menu-items'],
    queryFn: async () => {
      const res = await api.get('/owner/menu/items');
      return res.data.data.items as MenuItem[];
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      await api.post('/owner/menu/categories', {
        name: newCategory,
        parentId: parentCategorySelect || null,
      });
    },
    onSuccess: () => {
      toast.success('Category created');
      setNewCategory('');
      setParentCategorySelect('');
      setShowAddCategory(false);
      qc.invalidateQueries({ queryKey: ['owner-categories'] });
      setPreviewVersion((v) => v + 1);
    },
    onError: () => toast.error('Failed to create category'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/owner/menu/categories/${id}`);
    },
    onSuccess: () => {
      toast.success('Category deleted');
      qc.invalidateQueries({ queryKey: ['owner-categories'] });
      setPreviewVersion((v) => v + 1);
    },
    onError: () => toast.error('Failed to delete category'),
  });

  const toggleItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/owner/menu/items/${id}/availability`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-menu-items'] });
      setPreviewVersion((v) => v + 1);
    },
    onError: () => toast.error('Failed to toggle item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/owner/menu/items/${id}`);
    },
    onSuccess: () => {
      toast.success('Item deleted');
      qc.invalidateQueries({ queryKey: ['owner-menu-items'] });
      setPreviewVersion((v) => v + 1);
    },
    onError: () => toast.error('Failed to delete item'),
  });

  const seedDemoMutation = useMutation({
    mutationFn: async () => {
      await api.post('/owner/menu/seed-demo');
    },
    onSuccess: () => {
      toast.success('Sample demo menu loaded! 🎉');
      qc.invalidateQueries({ queryKey: ['owner-categories'] });
      qc.invalidateQueries({ queryKey: ['owner-menu-items'] });
      setPreviewVersion((v) => v + 1);
    },
    onError: () => toast.error('Failed to load sample menu'),
  });

  const openAddItemModal = () => {
    setEditItem(null);
    setForm({
      name: '',
      description: '',
      price: '',
      categoryId: activeCategory ?? (catData?.[0]?.id || ''),
      isVeg: true,
      isAvailable: true,
      image: null,
      variants: [],
      addOns: [],
    });
    setShowAddItem(true);
  };

  const openEditItemModal = (item: MenuItem) => {
    setEditItem(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      categoryId: item.categoryId,
      isVeg: item.isVeg,
      isAvailable: item.isAvailable,
      image: null,
      variants: item.variants ? [...item.variants] : [],
      addOns: item.addOns ? [...item.addOns] : [],
    });
    setShowAddItem(true);
  };

  const addVariantRow = () => {
    setForm((f) => ({
      ...f,
      variants: [...f.variants, { name: '', price: '' }],
    }));
  };

  const removeVariantRow = (index: number) => {
    setForm((f) => ({
      ...f,
      variants: f.variants.filter((_, i) => i !== index),
    }));
  };

  const updateVariantRow = (index: number, key: 'name' | 'price', val: string) => {
    setForm((f) => {
      const updated = [...f.variants];
      if (updated[index]) {
        updated[index] = { ...updated[index], [key]: val };
      }
      return { ...f, variants: updated };
    });
  };

  const addAddOnRow = () => {
    setForm((f) => ({
      ...f,
      addOns: [...f.addOns, { name: '', price: '' }],
    }));
  };

  const removeAddOnRow = (index: number) => {
    setForm((f) => ({
      ...f,
      addOns: f.addOns.filter((_, i) => i !== index),
    }));
  };

  const updateAddOnRow = (index: number, key: 'name' | 'price', val: string) => {
    setForm((f) => {
      const updated = [...f.addOns];
      if (updated[index]) {
        updated[index] = { ...updated[index], [key]: val };
      }
      return { ...f, addOns: updated };
    });
  };

  const submitItem = async () => {
    if (!form.name || !form.price || !form.categoryId) {
      toast.error('Please fill all required fields');
      return;
    }

    const cleanVariants = form.variants
      .filter((v) => v.name.trim() && v.price !== '')
      .map((v) => ({ name: v.name.trim(), price: parseFloat(String(v.price)) }));

    const cleanAddOns = form.addOns
      .filter((a) => a.name.trim() && a.price !== '')
      .map((a) => ({ name: a.name.trim(), price: parseFloat(String(a.price)) }));

    const fd = new FormData();
    fd.append('name', form.name);
    if (form.description) fd.append('description', form.description);
    fd.append('price', form.price);
    fd.append('categoryId', form.categoryId);
    fd.append('isVeg', String(form.isVeg));
    fd.append('isAvailable', String(form.isAvailable));
    fd.append('variants', JSON.stringify(cleanVariants));
    fd.append('addOns', JSON.stringify(cleanAddOns));

    if (form.image) fd.append('image', form.image);

    try {
      if (editItem) {
        await api.put(`/owner/menu/items/${editItem.id}`, fd);
        toast.success('Item updated with variants & add-ons');
      } else {
        await api.post('/owner/menu/items', fd);
        toast.success('Item created with variants & add-ons');
      }
      setShowAddItem(false);
      setEditItem(null);
      qc.invalidateQueries({ queryKey: ['owner-menu-items'] });
      setPreviewVersion((v) => v + 1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to save item');
    }
  };

  async function compressImageIfNeeded(file: File): Promise<File> {
    if (!file.type.startsWith('image/')) return file;
    if (file.size < 1024 * 1024) return file; // Under 1MB doesn't need compression

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1600;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const compressed = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now(),
                  });
                  resolve(compressed);
                  return;
                }
                resolve(file);
              },
              'image/jpeg',
              0.8
            );
          } else {
            resolve(file);
          }
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  // Menu document upload & parsing handler
  const handleUploadAndParse = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size exceeds 50MB limit. Please upload a smaller file or compressed image.');
      return;
    }

    setParsingLoading(true);
    try {
      const fileToUpload = await compressImageIfNeeded(file);
      setUploadFile(fileToUpload);

      const fd = new FormData();
      fd.append('file', fileToUpload);

      const res = await api.post('/owner/menu/upload-parse', fd, {
        timeout: 120000, // Allow up to 2 minutes for AI extraction
      });

      const data = res.data.data as {
        previewUrl: string;
        parsed: {
          categories: Array<{ name: string; parentName?: string }>;
          items: ParsedExtractedItem[];
        };
      };

      setPreviewUrl(data.previewUrl);
      setExtractedMenu(data.parsed);
      toast.success('Menu document parsed successfully! Review extracted items.');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to parse uploaded menu file';
      toast.error(errorMsg);
    } finally {
      setParsingLoading(false);
    }
  };

  const handleBatchImport = async () => {
    if (!extractedMenu || !extractedMenu.items || extractedMenu.items.length === 0) {
      toast.error('No items to import');
      return;
    }

    setImportingLoading(true);
    try {
      const res = await api.post('/owner/menu/batch-import', extractedMenu);
      toast.success(res.data.message || 'Menu items imported successfully! 🎉');
      setShowUploadModal(false);
      setUploadFile(null);
      setPreviewUrl(null);
      setExtractedMenu(null);
      qc.invalidateQueries({ queryKey: ['owner-categories'] });
      qc.invalidateQueries({ queryKey: ['owner-menu-items'] });
      setPreviewVersion((v) => v + 1);
    } catch {
      toast.error('Failed to import extracted menu items');
    } finally {
      setImportingLoading(false);
    }
  };

  const updateExtractedItem = (index: number, key: keyof ParsedExtractedItem, value: any) => {
    if (!extractedMenu) return;
    const updated = [...extractedMenu.items];
    if (updated[index]) {
      updated[index] = { ...updated[index], [key]: value };
    }
    setExtractedMenu({ ...extractedMenu, items: updated });
  };

  const removeExtractedItem = (index: number) => {
    if (!extractedMenu) return;
    const updated = extractedMenu.items.filter((_, i) => i !== index);
    setExtractedMenu({ ...extractedMenu, items: updated });
  };

  const subCatIds = activeCategory
    ? catData?.filter((c) => c.parentId === activeCategory).map((c) => c.id) || []
    : [];

  const filteredItems = activeCategory
    ? itemsData?.filter((i) => i.categoryId === activeCategory || subCatIds.includes(i.categoryId))
    : itemsData;

  const iframeUrl = restaurantData?.slug ? `/r/${restaurantData.slug}` : '';

  // Top level categories
  const topCategories = catData?.filter((c) => !c.parentId) || [];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Add / Edit Menu Item Modal with Custom Fields (Variants & Add-ons) */}
      <AnimatePresence>
        {showAddItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5 border-b border-border pb-3">
                <div>
                  <h2 className="font-display font-bold text-lg">
                    {editItem ? 'Edit Menu Item' : 'Add Menu Item & Custom Fields'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Configure dish details, sizes (Small, Medium, Large), and add-ons (Cheese Burst, Extra Toppings).
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowAddItem(false);
                    setEditItem(null);
                  }}
                  className="p-2 hover:bg-muted rounded-xl"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Item Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Cheese Burst Margherita Pizza"
                    className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Describe the dish ingredients and preparation..."
                    rows={2}
                    className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Base Price (₹) *
                    </label>
                    <input
                      type="number"
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="199.00"
                      min="0"
                      className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Category / Subcategory *
                    </label>
                    <select
                      value={form.categoryId}
                      onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Select category</option>
                      {catData?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parent ? `${c.parent.name} ➔ ${c.name}` : c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sizes / Portions (Variants) */}
                <div className="p-3 bg-muted/20 border border-border/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Sizes / Portions (Variants)
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        e.g. Small (₹199), Medium (₹299), Large (₹399), Half, Full
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addVariantRow}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Size
                    </button>
                  </div>

                  {form.variants.map((v, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        placeholder="Size Name (e.g. Medium 10&quot;)"
                        value={v.name}
                        onChange={(e) => updateVariantRow(idx, 'name', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Price ₹"
                        value={v.price}
                        onChange={(e) => updateVariantRow(idx, 'price', e.target.value)}
                        className="w-24 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeVariantRow(idx)}
                        className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add-ons & Customizations */}
                <div className="p-3 bg-muted/20 border border-border/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Add-ons & Customizations
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        e.g. Cheese Burst Crust (+₹60), Extra Jalapeños (+₹30)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addAddOnRow}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Customization
                    </button>
                  </div>

                  {form.addOns.map((a, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        placeholder="Add-on Name (e.g. Cheese Burst)"
                        value={a.name}
                        onChange={(e) => updateAddOnRow(idx, 'name', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs"
                      />
                      <input
                        type="number"
                        placeholder="Extra Price ₹"
                        value={a.price}
                        onChange={(e) => updateAddOnRow(idx, 'price', e.target.value)}
                        className="w-24 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeAddOnRow(idx)}
                        className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isVeg}
                      onChange={(e) => setForm((f) => ({ ...f, isVeg: e.target.checked }))}
                      className="accent-green-500"
                    />
                    <span className="text-sm">Vegetarian</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isAvailable}
                      onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
                      className="accent-primary"
                    />
                    <span className="text-sm">Available</span>
                  </label>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Dish Photo (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, image: e.target.files?.[0] ?? null }))
                    }
                    className="w-full px-3 py-2 text-xs text-muted-foreground border border-dashed border-border rounded-xl"
                  />
                </div>

                <div className="flex gap-3 pt-3 border-t border-border">
                  <button
                    onClick={submitItem}
                    className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-md"
                  >
                    {editItem ? 'Update Dish' : 'Save Dish'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddItem(false);
                      setEditItem(null);
                    }}
                    className="px-4 py-2.5 bg-muted rounded-xl font-medium text-sm hover:bg-muted/70 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Menu Document & Visualizer AI Auto-Fill Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 md:p-6"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
                    <FileUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-lg">
                      Upload Menu & Visual AI Auto-Fill
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Upload physical menu photos, PDFs, or documents. Visualize the menu and auto-fill categories, items, sizes & add-ons.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setExtractedMenu(null);
                    setPreviewUrl(null);
                    setUploadFile(null);
                  }}
                  className="p-2 hover:bg-muted rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Dual-Pane Body */}
              <div className="flex-1 flex overflow-hidden">
                {!extractedMenu && !parsingLoading ? (
                  /* Upload File Zone */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card">
                    <div className="max-w-md space-y-4">
                      <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
                        <UploadCloud className="w-10 h-10" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-display font-bold text-xl">Upload Restaurant Menu File</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Accepts any file format: Excel spreadsheets (.xlsx, .xls), CSV files (.csv), Images (PNG, JPG, WEBP), or PDF documents up to 50MB.
                        </p>
                      </div>

                      <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm cursor-pointer shadow-lg hover:bg-primary/90 transition-all transform active:scale-95">
                        <FileUp className="w-4 h-4" />
                        Choose Menu File (.xlsx, .csv, PDF, Image)
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv,.tsv,image/*,application/pdf,text/plain"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleUploadAndParse(e.target.files[0]);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : parsingLoading ? (
                  /* Loading State */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
                    <div className="space-y-1">
                      <h3 className="font-display font-bold text-lg">Extracting Menu with AI...</h3>
                      <p className="text-xs text-muted-foreground">
                        Scanning dishes, prices, categories, sizes (Small/Medium/Large), and add-ons...
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Dual-Pane Visualizer & Extracted Menu Editor */
                  <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {/* Left Pane: Document Visualizer Preview */}
                    <div className="w-full md:w-1/2 border-r border-border bg-black/40 flex flex-col h-1/2 md:h-full">
                      <div className="p-3 border-b border-border bg-card/60 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5" /> Uploaded Menu Visualizer
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[150px]">
                          {uploadFile?.name}
                        </span>
                      </div>

                      <div className="flex-1 p-3 overflow-auto flex items-center justify-center bg-zinc-950/80">
                        {uploadFile?.type.startsWith('image/') || previewUrl?.startsWith('data:image/') ? (
                          <img
                            src={previewUrl || ''}
                            alt="Uploaded Menu Document"
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                          />
                        ) : (
                          <iframe
                            src={previewUrl || ''}
                            className="w-full h-full rounded-xl border-0 bg-white"
                            title="Menu File Preview"
                          />
                        )}
                      </div>
                    </div>

                    {/* Right Pane: Extracted Items & Customization Editor */}
                    <div className="w-full md:w-1/2 flex flex-col h-1/2 md:h-full bg-card">
                      <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-sm flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-amber-500" /> AI Extracted Menu Catalog
                          </h3>
                          <p className="text-[11px] text-muted-foreground">
                            {extractedMenu?.items.length} items extracted. Edit names, prices, categories before importing.
                          </p>
                        </div>

                        <label className="text-xs text-primary font-semibold hover:underline cursor-pointer flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Re-upload
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv,.tsv,image/*,application/pdf,text/plain"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                handleUploadAndParse(e.target.files[0]);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Items List Table */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {extractedMenu?.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-muted/20 border border-border rounded-2xl space-y-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-3 h-3 rounded-full border flex-shrink-0 ${
                                  item.isVeg ? 'border-green-500 bg-green-500/20' : 'border-red-500 bg-red-500/20'
                                }`}
                              />
                              <input
                                value={item.name}
                                onChange={(e) => updateExtractedItem(idx, 'name', e.target.value)}
                                className="flex-1 font-semibold px-2 py-1 bg-background border border-border rounded-lg text-xs"
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">₹</span>
                                <input
                                  type="number"
                                  value={item.price}
                                  onChange={(e) =>
                                    updateExtractedItem(idx, 'price', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-20 px-2 py-1 bg-background border border-border rounded-lg text-xs font-bold text-primary"
                                />
                              </div>
                              <button
                                onClick={() => removeExtractedItem(idx)}
                                className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <input
                                placeholder="Category"
                                value={item.categoryName}
                                onChange={(e) => updateExtractedItem(idx, 'categoryName', e.target.value)}
                                className="px-2 py-1 bg-background border border-border rounded-lg text-[11px]"
                              />
                              <input
                                placeholder="Parent Category (optional)"
                                value={item.parentCategoryName || ''}
                                onChange={(e) =>
                                  updateExtractedItem(idx, 'parentCategoryName', e.target.value)
                                }
                                className="px-2 py-1 bg-background border border-border rounded-lg text-[11px]"
                              />
                            </div>

                            {/* Variants preview */}
                            {item.variants && item.variants.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap">
                                {item.variants.map((v, vIdx) => (
                                  <span
                                    key={vIdx}
                                    className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-[10px] font-medium"
                                  >
                                    {v.name}: ₹{v.price}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Add-ons preview */}
                            {item.addOns && item.addOns.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap">
                                {item.addOns.map((a, aIdx) => (
                                  <span
                                    key={aIdx}
                                    className="px-2 py-0.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-md text-[10px] font-medium"
                                  >
                                    +{a.name} (+₹{a.price})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Footer Actions */}
                      <div className="p-4 border-t border-border bg-card flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          Ready to populate database catalog.
                        </div>

                        <button
                          onClick={handleBatchImport}
                          disabled={importingLoading}
                          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-xs shadow-lg hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {importingLoading
                            ? 'Importing Menu...'
                            : `Import ${extractedMenu?.items.length || 0} Dishes to Menu`}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <OwnerSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-3.5 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur-sm gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-muted shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-bold text-base sm:text-xl truncate">Menu Management</h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <WaiterBell />

            {/* Upload Menu & Visualizer AI Auto-Fill Button */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-xs shadow-sm transition-all whitespace-nowrap shrink-0"
              title="Upload Physical Menu File & Visual AI Auto-Fill"
            >
              <FileUp className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Upload Menu (AI)</span>
              <span className="sm:hidden">Upload</span>
            </button>

            {/* Load Sample Menu */}
            <button
              onClick={() => seedDemoMutation.mutate()}
              disabled={seedDemoMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-semibold text-xs shadow-sm transition-all disabled:opacity-60 whitespace-nowrap shrink-0"
              title="Load Sample Demo Menu"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {seedDemoMutation.isPending ? 'Loading...' : 'Sample Menu'}
              </span>
            </button>

            {/* Add Item */}
            <button
              onClick={openAddItemModal}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-xs sm:text-sm hover:bg-primary/90 transition-colors whitespace-nowrap shrink-0 shadow-sm"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Add Item</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </header>

        {/* Mobile Horizontal Categories Bar */}
        <div className="md:hidden flex gap-2 overflow-x-auto no-scrollbar p-3 border-b border-border bg-card/30">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              !activeCategory
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            All ({itemsData?.length ?? 0})
          </button>
          {catData?.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                activeCategory === c.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {c.parent ? `${c.parent.name} ➔ ${c.name}` : c.name} ({c._count.items})
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Categories Sidebar Tree */}
          <div className="w-64 border-r border-border bg-card/50 flex flex-col hidden md:flex">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Categories & Subcategories
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <button
                onClick={() => setActiveCategory(null)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all ${
                  !activeCategory
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                All Dishes ({itemsData?.length ?? 0})
              </button>

              {topCategories.map((topCat) => {
                const subcats = catData?.filter((c) => c.parentId === topCat.id) || [];
                return (
                  <div key={topCat.id} className="space-y-1">
                    {/* Top Level Category */}
                    <div className="flex items-center gap-1 group">
                      <button
                        onClick={() => setActiveCategory(topCat.id)}
                        className={`flex-1 text-left px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                          activeCategory === topCat.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        📁 {topCat.name} ({topCat._count.items})
                      </button>
                      <button
                        onClick={() => deleteCategoryMutation.mutate(topCat.id)}
                        className="p-1 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-muted"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Subcategories Indented */}
                    {subcats.length > 0 && (
                      <div className="pl-4 space-y-1 border-l-2 border-border/40 ml-3">
                        {subcats.map((subCat) => (
                          <div key={subCat.id} className="flex items-center gap-1 group">
                            <button
                              onClick={() => setActiveCategory(subCat.id)}
                              className={`flex-1 text-left px-2.5 py-1 rounded-lg text-xs transition-all ${
                                activeCategory === subCat.id
                                  ? 'bg-primary/10 text-primary font-bold'
                                  : 'text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              ↳ {subCat.name} ({subCat._count.items})
                            </button>
                            <button
                              onClick={() => deleteCategoryMutation.mutate(subCat.id)}
                              className="p-1 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-muted"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-border space-y-2">
              {showAddCategory ? (
                <div className="space-y-2">
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Category / Subcategory name"
                    className="w-full px-2.5 py-1.5 text-xs bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />

                  <select
                    value={parentCategorySelect}
                    onChange={(e) => setParentCategorySelect(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-muted/30 border border-border rounded-lg focus:outline-none"
                  >
                    <option value="">Top-Level Category</option>
                    {topCategories.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        Parent: {tc.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={() => createCategoryMutation.mutate()}
                      className="flex-1 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-lg"
                    >
                      Save Category
                    </button>
                    <button
                      onClick={() => setShowAddCategory(false)}
                      className="px-2 py-1 bg-muted text-xs rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddCategory(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors border border-dashed border-border"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Category / Subcategory
                </button>
              )}
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-48 skeleton rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems?.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-card border rounded-2xl overflow-hidden transition-all shadow-xs flex flex-col justify-between ${
                      item.isAvailable ? 'border-border' : 'border-dashed border-border opacity-60'
                    }`}
                  >
                    <div>
                      <div className="w-full h-36 overflow-hidden bg-muted relative">
                        <img
                          src={item.image || getOwnerFallbackFoodImage(item.name, item.isVeg)}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <div
                                className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                                  item.isVeg ? 'border-green-500' : 'border-red-500'
                                }`}
                              >
                                <div
                                  className={`w-1.5 h-1.5 rounded-full m-px ${
                                    item.isVeg ? 'bg-green-500' : 'bg-red-500'
                                  }`}
                                />
                              </div>
                              <p className="font-semibold text-sm truncate">{item.name}</p>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.category.name}
                            </p>
                          </div>
                          <p className="font-bold text-sm text-primary flex-shrink-0">
                            ₹{item.price}
                          </p>
                        </div>

                        {/* Variants pill badges */}
                        {item.variants && item.variants.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {item.variants.map((v, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-[10px] font-medium"
                              >
                                {v.name}: ₹{v.price}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Add-ons pill badges */}
                        {item.addOns && item.addOns.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {item.addOns.map((a, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-md text-[10px] font-medium"
                              >
                                +{a.name} (+₹{a.price})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-3 pt-0 flex items-center justify-between border-t border-border/40 mt-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditItemModal(item)}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteItemMutation.mutate(item.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => toggleItemMutation.mutate(item.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                          item.isAvailable
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        }`}
                      >
                        {item.isAvailable ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                        {item.isAvailable ? 'Available' : 'Hidden'}
                      </button>
                    </div>
                  </motion.div>
                ))}

                {filteredItems?.length === 0 && (
                  <div className="col-span-3 text-center py-16 px-4 text-muted-foreground bg-card/40 border border-dashed border-border rounded-3xl space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto text-2xl">
                      🍽️
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-display font-bold text-lg text-foreground">
                        No items in your menu yet
                      </h3>
                      <p className="text-sm max-w-md mx-auto">
                        Start by creating items manually with sizes & add-ons, or upload your physical menu file to auto-extract with AI!
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm shadow-md transition-all"
                      >
                        <FileUp className="w-4 h-4" /> Upload Menu File (AI)
                      </button>

                      <button
                        onClick={() => seedDemoMutation.mutate()}
                        disabled={seedDemoMutation.isPending}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-semibold text-sm shadow-md transition-all disabled:opacity-60"
                      >
                        <Sparkles className="w-4 h-4 animate-pulse" />
                        {seedDemoMutation.isPending ? 'Loading...' : 'Load Sample Menu'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Mobile Preview (Right Side) */}
          <div className="w-[340px] border-l border-border bg-card/20 p-4 hidden xl:flex flex-col items-center justify-start overflow-y-auto">
            <div className="w-full flex items-center justify-between mb-4 pb-2 border-b border-border">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                Live Customer Menu Preview
              </h3>
              <span className="text-[10px] text-muted-foreground bg-muted px-2.5 py-1 rounded-lg">
                Real-time
              </span>
            </div>

            <div className="relative w-[280px] h-[560px] rounded-[3rem] border-[10px] border-zinc-950 bg-zinc-950 shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-32 bg-zinc-950 rounded-b-2xl z-45 flex items-center justify-center">
                <div className="w-10 h-1 bg-zinc-800 rounded-full" />
              </div>

              {iframeUrl && (
                <iframe
                  key={previewVersion}
                  src={`${iframeUrl}?v=${previewVersion}`}
                  className="w-full h-full border-0 select-none bg-background"
                  title="Menu Preview"
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
