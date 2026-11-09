'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Sparkles, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import api from '@/services/api';
import { useCartStore } from '@/store/cart.store';
import { toast } from 'sonner';

interface AIRecommendationsProps {
  restaurantId: string;
  themeColor: string;
}

export function AIRecommendations({ restaurantId, themeColor }: AIRecommendationsProps) {
  const { addItem } = useCartStore();

  const { data, isLoading } = useQuery({
    queryKey: ['ai-recommendations', restaurantId],
    queryFn: async () => {
      const response = await api.post('/ai/recommend', { restaurantId });
      const recommendations = response.data?.data?.recommendations ?? (Array.isArray(response.data?.data) ? response.data.data : []);
      return recommendations as Array<{
        menuItemId: string;
        name: string;
        reason: string;
        menuItem: {
          id: string;
          name: string;
          price: number;
          image: string | null;
          isVeg: boolean;
        } | undefined;
      }>;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mb-2">
        <div className="h-4 skeleton rounded w-32 mb-3" />
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-44 h-28 skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: themeColor }} />
        <span className="font-display font-semibold text-sm">Recommended for You</span>
        <span className="text-xs text-muted-foreground ml-auto">AI-powered</span>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {data.map((rec, i) => {
          const item = rec.menuItem;
          if (!item) return null;

          return (
            <motion.div
              key={rec.menuItemId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex-shrink-0 w-44 rounded-2xl overflow-hidden border border-border bg-card cursor-pointer card-hover"
              onClick={() => {
                addItem({
                  menuItemId: item.id,
                  name: item.name,
                  image: item.image,
                  isVeg: item.isVeg,
                  variantId: null,
                  variantName: null,
                  unitPrice: item.price,
                  addOns: [],
                  quantity: 1,
                });
                toast.success(`${item.name} added!`);
              }}
            >
              {item.image ? (
                <div className="relative h-24 w-full">
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                </div>
              ) : (
                <div className="h-24 flex items-center justify-center text-3xl"
                  style={{ background: `${themeColor}20` }}>
                  {item.isVeg ? '🥗' : '🍗'}
                </div>
              )}
              <div className="p-2.5">
                <p className="font-semibold text-xs line-clamp-1">{item.name}</p>
                <p className="text-muted-foreground text-xs line-clamp-2 mt-0.5 leading-tight">{rec.reason}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-xs" style={{ color: themeColor }}>₹{item.price}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
