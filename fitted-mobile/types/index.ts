/ Types adapted from the original Vite project for React Native

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

export interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    text: string;
    created_at: string;
    is_read: boolean;
    payment_request?: PaymentRequest;
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
