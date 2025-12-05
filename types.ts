
export interface User {
  id: string;
  username: string;
  handle: string;
  avatarUrl: string;
  headerUrl?: string; // Background banner
  aiFaceUrl?: string; // Reference photo for AI generation
  socials?: {
    instagram?: string;
    twitter?: string;
    tiktok?: string;
  };
  bio: string;
  location: string;
  website?: string; // New: Bio Link
  isBusinessAccount?: boolean; // New: Account Type
  stats: {
    followers: number;
    following: number;
    fits: number;
  };
  isVerifiedStylist?: boolean;
  rate?: string; // Stylist rate (e.g. "$50 / fit")
  showActivityStatus?: boolean;
  
  // New Profile Features
  favoriteBrand?: string;
  favoriteSong?: {
    title: string;
    artist: string;
    url?: string; // External link
  };
}

export interface ClothingItem {
  id: string;
  brand: string;
  name: string;
  price: number;
  imageUrl: string;
  purchaseLink: string;
  // Visual state for the board
  canvasState?: {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    isBgRemoved: boolean;
  };
}

export interface Post {
  id: string;
  user: User;
  generatedImage: string; // The AI "Nano Banana" image
  boardImage: string; // The flatlay board (optional, or we render live)
  caption: string;
  likes: number;
  items: ClothingItem[];
  timestamp: string; // Static display string (legacy)
  createdAt?: number; // Real timestamp for live updates
  isLiked?: boolean;
  // Configuration for the board background
  backgroundConfig?: {
    type: 'color' | 'image' | 'pattern';
    value: string;
    id?: string;
  };
  // Attached music track
  music?: {
    title: string;
    artist: string;
    cover?: string;
  };
}

export interface Stylist {
  id: string;
  user: User;
  ranking: number;
}

export interface Comment {
  id: string;
  username: string;
  handle: string; // User handle (e.g. @bnod)
  avatarUrl: string;
  text: string;
  timestamp: string;
  createdAt?: number;
  isLiked?: boolean;
  likes: number;
}

export type PaymentStatus = 'pending' | 'completed' | 'failed';

export interface PaymentRequest {
  type: 'request' | 'send'; // Distinguish between asking for money and sending money
  amount: number;
  description: string;
  status: PaymentStatus;
  currency: string;
  transactionId?: string; // Real Stripe ID would go here
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  createdAt?: number;
  isRead: boolean;
  isOwn?: boolean;
  paymentRequest?: PaymentRequest; // Optional payment data
}

export interface Conversation {
  id: string;
  participants: User[]; 
  lastMessage: Message;
  unreadCount: number;
}

export interface Asset {
  id: string;
  url: string;
  dateAdded: number;
  fileSignature?: string; // Used for deduplication
}

export interface Folder {
  id: string;
  name: string;
  assets: Asset[];
  isDefault?: boolean;
}