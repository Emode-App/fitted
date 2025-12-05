
import { MOCK_USERS, MOCK_POSTS, CURRENT_USER } from '../constants';
import { Post, User, Comment, Conversation, Message, Folder, Asset, PaymentRequest } from '../types';

// Helper to parse relative time string to minutes
const parseTimeMinutes = (timeStr: string): number => {
    if (timeStr === 'Just now' || timeStr === 'now') return 0;
    const match = timeStr.match(/(\d+)([mhdw])/);
    if (!match) return 0;
    const num = parseInt(match[1]);
    const unit = match[2];
    if (unit === 'm') return num;
    if (unit === 'h') return num * 60;
    if (unit === 'd') return num * 60 * 24;
    if (unit === 'w') return num * 60 * 24 * 7;
    return 0;
};

// In-memory store initialized with constants
let usersStore = { ...MOCK_USERS };
// Hydrate posts with createdAt based on static timestamp
let postsStore = [...MOCK_POSTS].map(p => ({
    ...p,
    createdAt: Date.now() - parseTimeMinutes(p.timestamp) * 60 * 1000
}));

// Wardrobe Store
const DEFAULT_FOLDERS: Folder[] = [
  { id: 'last_used', name: 'Last Used', isDefault: true, assets: [
      { id: 'm1', url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=400', dateAdded: Date.now() },
      { id: 'm2', url: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=400', dateAdded: Date.now() }
  ] },
  { id: 'shirts', name: 'Shirts', assets: [] },
  { id: 'jackets', name: 'Jackets', assets: [] },
  { id: 'pants', name: 'Pants', assets: [] },
  { id: 'shoes', name: 'Shoes', assets: [] },
  { id: 'accessories', name: 'Accessories', assets: [] },
];

let wardrobeStore: Folder[] = [...DEFAULT_FOLDERS];

// Relationships: followerId -> Set<targetId>
const followingStore: Record<string, Set<string>> = {
  [CURRENT_USER.id]: new Set(['u2', 's1', 's3']), // Me following others
  'u2': new Set([CURRENT_USER.id, 's1', 's3']),   // u2 follows me, s1, s3
  's1': new Set([CURRENT_USER.id, 'u2']),         // s1 follows me, u2
  's2': new Set(['s1', 's3']),                    // s2 follows s1, s3
  's3': new Set([CURRENT_USER.id, 'u2', 's2']),   // s3 follows me, u2, s2
};

// Saved Posts: userId -> Set<postId>
const savedPostsStore: Record<string, Set<string>> = {
    [CURRENT_USER.id]: new Set(['p2']) // Initial mock save
};

// Comments: postId -> Comment[]
// Hydrate comments with createdAt
const commentsStore: Record<string, Comment[]> = {
  'p1': [
    { id: 'c1', username: 'steven', handle: '@steven', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100', text: 'This goes hard 🔥', timestamp: '2m', createdAt: Date.now() - 2 * 60 * 1000, isLiked: false, likes: 0 },
    { id: 'c2', username: 'alealimay', handle: '@aleali', avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=100', text: 'Need that hoodie asap.', timestamp: '5m', createdAt: Date.now() - 5 * 60 * 1000, isLiked: false, likes: 0 },
  ],
  'p2': [
    { id: 'c3', username: 'bloodyosiris', handle: '@bloody', avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a3694c2dd77?auto=format&fit=crop&q=80&w=100', text: 'Rick always valid.', timestamp: '12m', createdAt: Date.now() - 12 * 60 * 1000, isLiked: false, likes: 0 },
    { id: 'c4', username: 'yungbrando', handle: '@bnod', avatarUrl: CURRENT_USER.avatarUrl, text: 'Grails only.', timestamp: '1h', createdAt: Date.now() - 60 * 60 * 1000, isLiked: false, likes: 0 },
  ]
};

// Messaging Mock Data
// Hydrate messages with createdAt
const messagesStore: Record<string, Message[]> = {
  'conv_1': [
    { id: 'm1', senderId: 'u2', text: 'Yo, that Rick Owens fit was crazy.', timestamp: '2h ago', createdAt: Date.now() - 120 * 60 * 1000, isRead: true },
    { id: 'm2', senderId: 'u1', text: 'Preciate it bro! Trying to step it up.', timestamp: '1h ago', createdAt: Date.now() - 60 * 60 * 1000, isRead: true },
    { id: 'm3', senderId: 'u2', text: 'Where did you cop the Geobaskets?', timestamp: '5m ago', createdAt: Date.now() - 5 * 60 * 1000, isRead: false },
  ],
  'conv_2': [
    { id: 'm4', senderId: 's1', text: 'Hey, I saw your profile. Would love to style you sometime.', timestamp: '1d ago', createdAt: Date.now() - 1440 * 60 * 1000, isRead: true },
    { id: 'm5', senderId: 's1', text: 'My rate is $50/fit if you are interested.', timestamp: '1d ago', createdAt: Date.now() - 1440 * 60 * 1000, isRead: true },
  ]
};

const conversationsStore: Conversation[] = [
  {
    id: 'conv_1',
    participants: [MOCK_USERS['u1'], MOCK_USERS['u2']],
    lastMessage: { id: 'm3', senderId: 'u2', text: 'Where did you cop the Geobaskets?', timestamp: '5m ago', createdAt: Date.now() - 5 * 60 * 1000, isRead: false },
    unreadCount: 1
  },
  {
    id: 'conv_2',
    participants: [MOCK_USERS['u1'], MOCK_USERS['s1']],
    lastMessage: { id: 'm5', senderId: 's1', text: 'My rate is $50/fit if you are interested.', timestamp: '1d ago', createdAt: Date.now() - 1440 * 60 * 1000, isRead: true },
    unreadCount: 0
  }
];

const listeners: (() => void)[] = [];

export const subscribe = (listener: () => void) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
};

const notify = () => {
  listeners.forEach(l => l());
};

// --- DATA INTEGRITY HELPERS ---

const recalculateAllStats = () => {
    Object.keys(usersStore).forEach(userId => {
        const user = usersStore[userId];
        const fitCount = postsStore.filter(p => p.user.id === userId).length;
        const followingCount = followingStore[userId] ? followingStore[userId].size : 0;
        let followerCount = 0;
        Object.values(followingStore).forEach(followingSet => {
            if (followingSet.has(userId)) {
                followerCount++;
            }
        });

        usersStore[userId] = {
            ...user,
            stats: {
                fits: fitCount,
                following: followingCount,
                followers: followerCount
            }
        };
    });
};

recalculateAllStats();

// --- EXPORTS ---

export const getUser = (userId: string): User | undefined => {
  return usersStore[userId];
};

export const getUserByHandle = (handle: string): User | undefined => {
    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    // Case insensitive matching for handle
    return Object.values(usersStore).find(u => u.handle.toLowerCase() === cleanHandle.toLowerCase());
};

export const searchUsers = (query: string): User[] => {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return Object.values(usersStore).filter(user => 
        user.username.toLowerCase().includes(lowerQuery) || 
        user.handle.toLowerCase().includes(lowerQuery) ||
        (user.bio && user.bio.toLowerCase().includes(lowerQuery))
    );
};

export const updateUser = (updatedUser: User) => {
  if (usersStore[updatedUser.id]) {
    usersStore[updatedUser.id] = updatedUser;
    notify();
  }
};

export const verifyUser = (userId: string) => {
    if (usersStore[userId]) {
        usersStore[userId] = {
            ...usersStore[userId],
            isVerifiedStylist: true
        };
        notify();
    }
}

export const toggleBusinessAccount = (userId: string) => {
    if (usersStore[userId]) {
        usersStore[userId] = {
            ...usersStore[userId],
            isBusinessAccount: !usersStore[userId].isBusinessAccount
        };
        notify();
    }
}

export const getUserPosts = (userId: string): Post[] => {
  const userPosts = postsStore.filter(post => post.user.id === userId);
  return userPosts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

export const getAllPosts = (): Post[] => {
  return [...postsStore].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

export const addPost = (post: Post) => {
  const newPost = { ...post, createdAt: Date.now() }; // Set real timestamp
  postsStore.unshift(newPost);
  const user = usersStore[post.user.id];
  if (user) {
    usersStore[post.user.id] = {
      ...user,
      stats: { ...user.stats, fits: user.stats.fits + 1 }
    };
  }
  notify();
};

export const deletePost = (postId: string) => {
  const postToDelete = postsStore.find(p => p.id === postId);
  postsStore = postsStore.filter(p => p.id !== postId);
  
  // Also remove from saved lists
  Object.values(savedPostsStore).forEach(set => set.delete(postId));
  
  if (postToDelete) {
      const userId = postToDelete.user.id;
      const user = usersStore[userId];
      if (user) {
          usersStore[userId] = {
              ...user,
              stats: {
                  ...user.stats,
                  fits: Math.max(0, user.stats.fits - 1)
              }
          };
      }
  }
  notify();
};

export const togglePostLike = (postId: string) => {
    const post = postsStore.find(p => p.id === postId);
    if (post) {
        post.isLiked = !post.isLiked;
        post.likes = post.isLiked ? post.likes + 1 : Math.max(0, post.likes - 1);
        notify();
    }
};

export const isFollowing = (followerId: string, targetId: string): boolean => {
  return followingStore[followerId]?.has(targetId) || false;
};

export const getFollowers = (userId: string): User[] => {
  const followers: User[] = [];
  Object.keys(followingStore).forEach(followerId => {
    if (followingStore[followerId].has(userId)) {
      const u = usersStore[followerId];
      if (u) followers.push(u);
    }
  });
  return followers;
};

export const getFollowing = (userId: string): User[] => {
  const followingIds = followingStore[userId] || new Set();
  const following: User[] = [];
  followingIds.forEach(id => {
    const u = usersStore[id];
    if (u) following.push(u);
  });
  return following;
};

export const toggleFollow = (followerId: string, targetId: string) => {
  if (!followingStore[followerId]) {
    followingStore[followerId] = new Set();
  }

  const following = followingStore[followerId];
  if (following.has(targetId)) {
    following.delete(targetId);
  } else {
    following.add(targetId);
  }
  
  const targetUser = usersStore[targetId];
  if (targetUser) {
     const followerCount = getFollowers(targetId).length;
     usersStore[targetId] = {
        ...targetUser,
        stats: { ...targetUser.stats, followers: followerCount }
     };
  }

  const currentUser = usersStore[followerId];
  if (currentUser) {
      const followingCount = following.size;
      usersStore[followerId] = {
          ...currentUser,
          stats: { ...currentUser.stats, following: followingCount }
      };
  }

  notify();
};

// --- SAVED POSTS LOGIC ---

export const isPostSaved = (userId: string, postId: string): boolean => {
    return savedPostsStore[userId]?.has(postId) || false;
};

export const toggleSavePost = (userId: string, postId: string) => {
    if (!savedPostsStore[userId]) {
        savedPostsStore[userId] = new Set();
    }
    const saved = savedPostsStore[userId];
    if (saved.has(postId)) {
        saved.delete(postId);
    } else {
        saved.add(postId);
    }
    notify();
};

export const getSavedPosts = (userId: string): Post[] => {
    const savedIds = savedPostsStore[userId] || new Set();
    // Filter all posts to find the saved ones. 
    // In a real DB this would be a join or specific query.
    return postsStore.filter(p => savedIds.has(p.id));
};

export const getPostComments = (postId: string): Comment[] => {
  return commentsStore[postId] || [];
};

export const addComment = (postId: string, comment: Comment) => {
  if (!commentsStore[postId]) {
    commentsStore[postId] = [];
  }
  const newComment = { ...comment, createdAt: Date.now(), timestamp: 'Just now' };
  commentsStore[postId].push({ ...newComment, likes: 0 });
  notify();
};

export const deleteComment = (postId: string, commentId: string) => {
  if (commentsStore[postId]) {
    commentsStore[postId] = commentsStore[postId].filter(c => c.id !== commentId);
    notify();
  }
};

export const toggleCommentLike = (postId: string, commentId: string) => {
  const comments = commentsStore[postId];
  if (comments) {
    const commentIndex = comments.findIndex(c => c.id === commentId);
    if (commentIndex > -1) {
       const isLiked = !!comments[commentIndex].isLiked;
       comments[commentIndex] = {
         ...comments[commentIndex],
         isLiked: !isLiked,
         likes: isLiked ? Math.max(0, comments[commentIndex].likes - 1) : comments[commentIndex].likes + 1
       };
       notify();
    }
  }
};

// --- MESSAGING LOGIC ---

export const getConversations = (): Conversation[] => {
    return conversationsStore.sort((a, b) => (b.lastMessage.createdAt || 0) - (a.lastMessage.createdAt || 0));
};

export const getMessages = (conversationId: string): Message[] => {
    return messagesStore[conversationId] || [];
};

export const findOrCreateConversation = (participantId: string): string => {
    // Check if conversation exists
    const existing = conversationsStore.find(c => 
        c.participants.some(p => p.id === participantId) && 
        c.participants.some(p => p.id === CURRENT_USER.id)
    );
    
    if (existing) {
        return existing.id;
    }
    
    // Create new
    const newId = `conv_${Date.now()}`;
    const participantUser = usersStore[participantId];
    if (!participantUser) return '';

    const newConv: Conversation = {
        id: newId,
        participants: [CURRENT_USER, participantUser],
        lastMessage: {
            id: `sys_${Date.now()}`,
            senderId: 'system',
            text: 'Started a new conversation',
            timestamp: 'Just now',
            createdAt: Date.now(),
            isRead: true
        },
        unreadCount: 0
    };
    
    conversationsStore.push(newConv);
    messagesStore[newId] = [];
    notify();
    return newId;
};

export const sendMessage = (conversationId: string, text: string) => {
    const now = Date.now();
    const newMessage: Message = {
        id: `msg_${now}`,
        senderId: CURRENT_USER.id,
        text,
        timestamp: 'Just now',
        createdAt: now,
        isRead: true
    };
    
    // Add to messages store
    if (!messagesStore[conversationId]) {
        messagesStore[conversationId] = [];
    }
    messagesStore[conversationId].push(newMessage);

    // Update conversation last message
    const convIndex = conversationsStore.findIndex(c => c.id === conversationId);
    if (convIndex > -1) {
        conversationsStore[convIndex] = {
            ...conversationsStore[convIndex],
            lastMessage: newMessage,
            // Move to top logic handled by sort in getConversations
        };
    }

    notify();
};

export const sendPaymentRequest = (conversationId: string, amount: number, description: string) => {
    const now = Date.now();
    const paymentRequest: PaymentRequest = {
        type: 'request',
        amount,
        description,
        status: 'pending',
        currency: 'USD'
    };
    
    const newMessage: Message = {
        id: `msg_pay_${now}`,
        senderId: CURRENT_USER.id,
        text: `Requested $${amount}: ${description}`,
        timestamp: 'Just now',
        createdAt: now,
        isRead: true,
        paymentRequest
    };

    if (!messagesStore[conversationId]) {
        messagesStore[conversationId] = [];
    }
    messagesStore[conversationId].push(newMessage);

    const convIndex = conversationsStore.findIndex(c => c.id === conversationId);
    if (convIndex > -1) {
        conversationsStore[convIndex] = {
            ...conversationsStore[convIndex],
            lastMessage: newMessage
        };
    }
    notify();
};

export const sendDirectPayment = (conversationId: string, amount: number, description: string) => {
    const now = Date.now();
    const paymentRequest: PaymentRequest = {
        type: 'send',
        amount,
        description,
        status: 'pending', // IMPORTANT: Status is pending until accepted by receiver
        currency: 'USD',
        transactionId: `txn_${now}`
    };
    
    const newMessage: Message = {
        id: `msg_sent_${now}`,
        senderId: CURRENT_USER.id,
        text: `Sent $${amount}: ${description}`,
        timestamp: 'Just now',
        createdAt: now,
        isRead: true,
        paymentRequest
    };

    if (!messagesStore[conversationId]) {
        messagesStore[conversationId] = [];
    }
    messagesStore[conversationId].push(newMessage);

    const convIndex = conversationsStore.findIndex(c => c.id === conversationId);
    if (convIndex > -1) {
        conversationsStore[convIndex] = {
            ...conversationsStore[convIndex],
            lastMessage: newMessage
        };
    }
    notify();
};

export const markPaymentComplete = (conversationId: string, messageId: string) => {
    const messages = messagesStore[conversationId];
    if (messages) {
        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex > -1 && messages[msgIndex].paymentRequest) {
            messages[msgIndex].paymentRequest!.status = 'completed';
            notify();
        }
    }
};

export const acceptIncomingPayment = (conversationId: string, messageId: string) => {
    const messages = messagesStore[conversationId];
    if (messages) {
        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex > -1 && messages[msgIndex].paymentRequest && messages[msgIndex].paymentRequest.type === 'send') {
            messages[msgIndex].paymentRequest!.status = 'completed';
            notify();
        }
    }
};

export const markConversationAsRead = (conversationId: string) => {
    const convIndex = conversationsStore.findIndex(c => c.id === conversationId);
    if (convIndex > -1) {
        conversationsStore[convIndex] = {
            ...conversationsStore[convIndex],
            unreadCount: 0
        };
        notify();
    }
};

// --- WARDROBE LOGIC ---

export const getWardrobe = (): Folder[] => {
    return wardrobeStore;
};

// Helper for unique asset handling
const upsertAsset = (list: Asset[], newAsset: Asset) => {
   // Filter out any asset with same signature (if signature exists)
   let filtered = list;
   if (newAsset.fileSignature) {
       filtered = list.filter(a => a.fileSignature !== newAsset.fileSignature);
   }
   return [newAsset, ...filtered];
};

export const addAssetToWardrobe = (folderId: string, asset: Asset) => {
    wardrobeStore = wardrobeStore.map(f => {
        if (f.id === folderId) {
            return { ...f, assets: upsertAsset(f.assets, asset) };
        }
        return f;
    });
    // Also add to Last Used if it wasn't the target
    if (folderId !== 'last_used') {
        wardrobeStore = wardrobeStore.map(f => {
            if (f.id === 'last_used') {
                 return { ...f, assets: upsertAsset(f.assets, asset) };
            }
            return f;
        });
    }
    notify();
};

export const createFolder = (name: string) => {
    const newFolder: Folder = {
        id: `custom_${Date.now()}`,
        name: name,
        assets: []
    };
    wardrobeStore = [...wardrobeStore, newFolder];
    notify();
    return newFolder.id;
};
