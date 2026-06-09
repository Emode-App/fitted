// Types adapted from the original Vite project for React Native

export interface User {
    id: string;
    username: string;
    handle: string;
    avatar_url: string;
    header_url?: string;
    ai_face_url?: string;
    socials?: {
        instagram?: string;
        twitter?: string;
        tiktok?: string;
    };
    bio: string;
    location: string;
    website?: string;
    is_business_account?: boolean;
    is_verified_boutique?: boolean; // Green shield for verified brands
    visitor_count?: number; // Shop visitor count
    stats: {
        followers: number;
        following: number;
        fits: number;
    };
    is_verified_stylist?: boolean;
    rate?: string;
    show_activity_status?: boolean;
    favorite_brand?: string;
    favorite_song?: {
        title: string;
        artist: string;
        url?: string;
    };
    created_at?: string;
    // Stripe Connect (for stylists receiving payments)
    stripe_account_id?: string;
    stripe_customer_id?: string;
    stripe_onboarding_complete?: boolean;
    // Subscription status
    subscription_status?: 'none' | 'active' | 'expired' | 'canceled';
}

// Marketplace Types
export interface Product {
    id: string;
    seller_id: string;
    seller?: User;
    name: string;
    description: string;
    price: number;
    sizes: string[]; // e.g., ["S", "M", "L", "XL"]
    image_urls: string[];
    tags?: string[]; // e.g., ["secondhand", "streetwear"]
    external_links?: {
        website?: string;
        instagram?: string;
        tiktok?: string;
    };
    is_active: boolean;
    created_at: string;
}

export interface DressingRoomItem {
    id: string;
    user_id: string;
    product_id: string;
    product?: Product;
    added_at: string;
}

export interface ClothingItem {
    id: string;
    brand: string;
    name: string;
    price: number;
    image_url: string;
    purchase_link: string;
    canvas_state?: {
        x: number;
        y: number;
        rotation: number;
        scale: number;
        is_bg_removed: boolean;
    };
}

export interface Post {
    id: string;
    user_id: string;
    user?: User;
    generated_image: string;
    board_image?: string;
    caption: string;
    likes_count: number;
    items: ClothingItem[];
    created_at: string;
    is_liked?: boolean;
    is_saved?: boolean;
    background_config?: {
        type: 'color' | 'image' | 'pattern';
        value: string;
        id?: string;
    };
    music?: {
        title: string;
        artist: string;
        cover?: string;
    };
}

export interface Comment {
    id: string;
    post_id: string;
    user_id: string;
    user?: User;
    text: string;
    created_at: string;
    is_liked?: boolean;
    likes_count: number;
}

export type PaymentStatus = 'pending' | 'completed' | 'failed';

export interface PaymentRequest {
    type: 'request' | 'send';
    amount: number;
    description: string;
    status: PaymentStatus;
    currency: string;
    transaction_id?: string;
}

export interface StylingDelivery {
    generated_image_url: string;
    board_image_url?: string;
    items: ClothingItem[];
    caption?: string;
    styling_session_id?: string;
}

export interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    text: string;
    created_at: string;
    is_read: boolean;
    payment_request?: PaymentRequest;
    styling_delivery?: StylingDelivery;
    shared_face_url?: string;
}

export interface Conversation {
    id: string;
    participant_ids: string[];
    participants?: User[];
    last_message?: Message;
    unread_count: number;
    created_at: string;
}

export interface Asset {
    id: string;
    url: string;
    created_at: string;
    file_signature?: string;
}

export interface Folder {
    id: string;
    user_id: string;
    name: string;
    assets: Asset[];
    is_default?: boolean;
}

export type NotificationType = 'like' | 'comment' | 'follow';

export interface Notification {
    id: string;
    user_id: string; // recipient
    actor_id: string; // who triggered it
    actor?: User;
    type: NotificationType;
    post_id?: string;
    post?: Post;
    comment_id?: string;
    is_read: boolean;
    created_at: string;
}

// Styling Session Types
export type StylingSessionStatus = 'pending' | 'completed' | 'declined' | 'refunded';

export interface StylingSession {
    id: string;
    stylist_id: string;
    stylist?: User;
    client_id: string;
    client?: User;
    conversation_id: string;
    message_id: string; // the message containing the payment_request
    amount: number;
    description: string;
    status: StylingSessionStatus;
    created_at: string;
    completed_at?: string;
}
