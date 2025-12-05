
import React, { useState, useEffect } from 'react';
import { Post, ClothingItem } from '../types';
import { ChevronLeft } from 'lucide-react';
import { PostItem } from './PostItem';
import { BRAND_COLLECTIONS, MOCK_ITEMS } from '../constants';
import { Modal, StoreButtonRow } from './Shared';
import { searchProducts } from '../services/aiService';

interface FullPostViewProps {
  post: Post;
  onBack: () => void;
  onViewProfile?: (userId: string) => void;
  onViewBrand?: (brandName: string) => void;
  onViewHashtag?: (hashtag: string) => void;
}

export const FullPostView: React.FC<FullPostViewProps> = ({ post, onBack, onViewProfile, onViewBrand, onViewHashtag }) => {
  // Extract brands and remove empty/duplicates
  const brands = Array.from(new Set(post.items.map(i => i.brand))).filter((b: string) => b && b.trim() !== '') as string[];
  const [selectedShopItem, setSelectedShopItem] = useState<ClothingItem | null>(null);
  
  // State to store dynamically fetched collections for unknown brands
  const [dynamicCollections, setDynamicCollections] = useState<Record<string, ClothingItem[]>>({});

  // Effect to fetch missing brands
  useEffect(() => {
    const fetchMissingBrands = async () => {
        const missingBrands = brands.filter(brand => {
             // Check if brand exists in static data (case-insensitive)
             const hasStaticCollection = Object.keys(BRAND_COLLECTIONS).some(k => k.toLowerCase() === brand.toLowerCase());
             const hasMockItems = MOCK_ITEMS.some(i => i.brand.toLowerCase() === brand.toLowerCase());
             
             // If not in static data and not already fetched
             return !hasStaticCollection && !hasMockItems && !dynamicCollections[brand];
        });

        if (missingBrands.length === 0) return;

        // Fetch items for each missing brand
        for (const brand of missingBrands) {
            try {
                // Use searchProducts to find items for this brand
                const results = await searchProducts(`${brand} clothing`);
                
                if (results && results.length > 0) {
                    const mappedItems: ClothingItem[] = results.map((item: any, index: number) => {
                        // Image Fallback Logic (Same as Create.tsx)
                        let imageUrl = item.imageUrl;
                        if (!imageUrl || imageUrl.length < 10 || imageUrl.includes('via.placeholder')) {
                             const searchTerm = `${item.brand} ${item.name} white background`;
                             imageUrl = `https://tse2.mm.bing.net/th?q=${encodeURIComponent(searchTerm)}&w=500&h=500&c=7&rs=1&p=0`;
                        } else {
                             // Proxy existing URL
                             imageUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&w=500&output=png`;
                        }

                        return {
                            id: `dyn_${brand}_${index}`,
                            brand: item.brand || brand,
                            name: item.name,
                            price: item.price || 0,
                            imageUrl: imageUrl,
                            purchaseLink: item.purchaseLink
                        };
                    });

                    setDynamicCollections(prev => ({ ...prev, [brand]: mappedItems }));
                }
            } catch (error) {
                console.error(`Failed to fetch dynamic items for ${brand}`, error);
            }
        }
    };

    fetchMissingBrands();
  }, [brands]);

  return (
    <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto animate-in slide-in-from-right duration-300 w-full transition-colors duration-200">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur z-50 px-4 h-14 flex items-center border-b border-gray-100 dark:border-zinc-800 w-full shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-black dark:text-white transition-colors">
            <ChevronLeft size={28} />
        </button>
        <div className="font-bold text-lg ml-2 text-black dark:text-white">Post</div>
      </div>

      <div className="pb-20 w-full">
        <PostItem 
            post={post} 
            onOpenFullView={() => {}} 
            onViewProfile={onViewProfile} 
            onViewHashtag={onViewHashtag}
        />

        {/* Shop Sections */}
        <div className="px-4 mt-2 mb-8">
            {brands.map(brand => {
                // Strict filtering with Case Insensitivity
                
                // 1. Try to find a matching key in BRAND_COLLECTIONS ignoring case
                const collectionKey = Object.keys(BRAND_COLLECTIONS).find(k => k.toLowerCase() === brand.toLowerCase());
                
                let collection: ClothingItem[] = [];
                
                if (collectionKey) {
                    collection = BRAND_COLLECTIONS[collectionKey];
                } else {
                    // 2. Fallback: Search in MOCK_ITEMS for matching brand ignoring case
                    collection = MOCK_ITEMS.filter(i => i.brand.toLowerCase() === brand.toLowerCase());
                }

                // 3. Fallback: Check dynamic collections
                if ((!collection || collection.length === 0) && dynamicCollections[brand]) {
                    collection = dynamicCollections[brand];
                }
                
                // If brand section is empty, hide it
                if (!collection || collection.length === 0) return null;

                // Use the nicely formatted brand name from the collection key if available, else user input
                const displayBrand = collectionKey || brand;

                return (
                    <div key={brand} className="mb-4 last:mb-0 animate-in fade-in duration-500">
                        <div className="flex items-baseline gap-1 mb-3 border-b border-gray-100 dark:border-zinc-800 pb-2">
                             <span className="text-xl text-gray-500 dark:text-zinc-500 font-light">More from</span>
                             <button 
                                onClick={() => onViewBrand && onViewBrand(displayBrand)}
                                className="text-xl font-medium underline decoration-1 underline-offset-4 text-black dark:text-white hover:text-gray-700 dark:hover:text-zinc-300 transition-colors"
                             >
                                {displayBrand}
                             </button>
                        </div>
                        
                        <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 w-full">
                            {collection.map((item, idx) => (
                                <div 
                                    key={item.id + idx} 
                                    className="flex-shrink-0 w-[140px] flex flex-col group cursor-pointer active:opacity-70"
                                    onClick={() => setSelectedShopItem(item)}
                                >
                                    {/* 1:1 Aspect Ratio for perfect alignment */}
                                    <div className="w-full aspect-square mb-2 relative bg-gray-50 dark:bg-white rounded-lg overflow-hidden border border-gray-100 dark:border-zinc-800">
                                        <img 
                                            src={item.imageUrl} 
                                            className="w-full h-full object-cover mix-blend-multiply" 
                                            alt={item.name} 
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                // If image fails, try a very generic fallback
                                                const fallback = `https://tse2.mm.bing.net/th?q=${encodeURIComponent(item.brand + ' ' + item.name)}&w=400&h=400&c=7&rs=1&p=0`;
                                                if (target.src !== fallback) {
                                                    target.src = fallback;
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 mb-0.5 truncate">{item.brand}</div>
                                    <div className="text-xs text-black dark:text-white font-medium mb-0.5">{item.name}</div>
                                    <div className="text-xs font-bold text-black dark:text-white">${item.price}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
      </div>

      {/* Shop Modal */}
      <Modal isOpen={!!selectedShopItem} onClose={() => setSelectedShopItem(null)} variant="center">
        {selectedShopItem && (
          <div className="flex flex-col items-center text-center pb-2 text-black dark:text-white">
            <div className="w-48 h-48 bg-gray-50 dark:bg-white rounded-xl mb-4 p-4 border border-gray-100 dark:border-zinc-700 shadow-inner flex items-center justify-center">
              <img src={selectedShopItem.imageUrl} className="max-w-full max-h-full object-contain mix-blend-multiply" alt={selectedShopItem.name}/>
            </div>
            <h2 className="text-xl font-bold mb-0.5 font-serif text-black dark:text-white">{selectedShopItem.brand}</h2>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4">{selectedShopItem.name}</p>
            <div className="text-2xl font-black mb-6 text-black dark:text-white">${selectedShopItem.price}</div>
            
            <StoreButtonRow link={selectedShopItem.purchaseLink} itemName={selectedShopItem.name} />

            <span className="text-[10px] text-gray-400 dark:text-zinc-500 mt-3 font-medium uppercase tracking-wider">Tap to buy</span>
          </div>
        )}
      </Modal>
    </div>
  );
};
