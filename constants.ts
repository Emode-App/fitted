
import { Post, User, Stylist, ClothingItem } from './types';

export const MOCK_USERS: Record<string, User> = {
  'u1': {
    id: 'u1',
    username: 'yungbrando',
    handle: '@bnod',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2.25&w=256&h=256&q=80',
    headerUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=1000',
    aiFaceUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2.25&w=500&h=500&q=80', // Pre-filled for demo
    socials: { instagram: 'bnod', twitter: 'bnod' },
    bio: 'Yung fly pretty n* wit a bankroll.',
    location: "Prince George's County, MD",
    stats: { followers: 305, following: 10, fits: 1 },
    showActivityStatus: true,
    favoriteBrand: 'Rick Owens',
    favoriteSong: {
        title: 'FE!N',
        artist: 'Travis Scott',
        url: 'https://music.apple.com/us/album/fe-n-feat-playboi-carti/1699712635?i=1699712644'
    }
  },
  'u2': {
    id: 'u2',
    username: 'fashion_killa',
    handle: '@rocky',
    avatarUrl: 'https://images.unsplash.com/photo-1531384441138-2736e62e0919?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2.25&w=256&h=256&q=80',
    headerUrl: 'https://images.unsplash.com/photo-1550614000-4b9519e0031a?auto=format&fit=crop&q=80&w=1000',
    socials: { instagram: 'asaprocky' },
    bio: 'Always strive and prosper.',
    location: 'Harlem, NY',
    stats: { followers: 12500, following: 200, fits: 42 },
    showActivityStatus: true,
    favoriteBrand: 'Bottega Veneta',
    favoriteSong: {
        title: 'L$D',
        artist: 'A$AP Rocky',
        url: '#'
    }
  },
  's1': {
    id: 's1', 
    username: 'steven', 
    handle: '@steven',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    headerUrl: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&q=80&w=1000',
    socials: { instagram: 'steven', twitter: 'steven' },
    bio: 'Verified Stylist. DM for rates.',
    location: 'Los Angeles, CA',
    stats: { followers: 4000, following: 150, fits: 89 },
    showActivityStatus: true,
    isVerifiedStylist: true,
    rate: '$50 / fit'
  },
  's2': {
    id: 's2', 
    username: 'bloodyosiris', 
    handle: '@bloody',
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a3694c2dd77?auto=format&fit=crop&q=80&w=200',
    headerUrl: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&q=80&w=1000',
    socials: { instagram: 'bloodyosiris' },
    bio: '1 of 1.',
    location: 'New York, NY',
    stats: { followers: 8000, following: 20, fits: 150 },
    showActivityStatus: false,
    isVerifiedStylist: true,
    rate: '$100 / fit'
  },
  's3': {
    id: 's3', 
    username: 'alealimay', 
    handle: '@aleali',
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200',
    headerUrl: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&q=80&w=1000',
    socials: { instagram: 'alealimay', twitter: 'alealimay' },
    bio: 'Stylist / Model.',
    location: 'Los Angeles, CA',
    stats: { followers: 5000, following: 400, fits: 65 },
    showActivityStatus: true,
    isVerifiedStylist: true,
    rate: '$75 / fit'
  }
};

export const CURRENT_USER = MOCK_USERS['u1'];

export const MOCK_ITEMS: ClothingItem[] = [
  {
    id: 'i1',
    brand: 'Helmut Lang',
    name: 'Painter Hoodie',
    price: 220,
    imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600',
    purchaseLink: 'https://helmutlang.com'
  },
  {
    id: 'i2',
    brand: 'Rhude',
    name: 'Traxedo Pant',
    price: 575,
    imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=600',
    purchaseLink: 'https://rh-ude.com'
  },
  {
    id: 'i3',
    brand: 'Yeezy',
    name: 'Boost 700 V2',
    price: 300,
    imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&q=80&w=600',
    purchaseLink: 'https://adidas.com'
  }
];

// Reordered chronologically (Oldest -> Newest) so reverse() works correctly for feed
export const MOCK_POSTS: Post[] = [
  {
    id: 'p2',
    user: MOCK_USERS['u2'],
    generatedImage: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=1000',
    boardImage: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1000',
    caption: 'Rick Owens head to toe.',
    likes: 892,
    items: [
      { id: 'i4', brand: 'Rick Owens', name: 'Dunk', price: 1200, imageUrl: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' }
    ],
    timestamp: '5h ago',
    isLiked: true
  },
  {
    id: 'p1',
    user: MOCK_USERS['u1'],
    generatedImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000',
    boardImage: 'https://images.unsplash.com/photo-1542272454315-4c01d7abdf4a?auto=format&fit=crop&q=80&w=1000',
    caption: 'Calm luh fit for the weekend. Nano Banana went crazy on the lighting.',
    likes: 444,
    items: MOCK_ITEMS,
    timestamp: '2h ago',
    isLiked: false
  }
];

export const TOP_STYLISTS: Stylist[] = [
  { id: 's1', ranking: 1, user: MOCK_USERS['s1'] },
  { id: 's2', ranking: 2, user: MOCK_USERS['s2'] },
  { id: 's3', ranking: 3, user: MOCK_USERS['s3'] },
];

export const BRAND_COLLECTIONS: Record<string, ClothingItem[]> = {
  'Helmut Lang': [
     { id: 'hl1', brand: 'Helmut Lang', name: 'Logo Tee', price: 76, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
     { id: 'hl2', brand: 'Helmut Lang', name: 'Track Shorts', price: 89, imageUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
     { id: 'hl3', brand: 'Helmut Lang', name: 'Cotton Shirt', price: 50, imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
     { id: 'hl4', brand: 'Helmut Lang', name: 'Zip Hoodie', price: 195, imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
  ],
  'Rhude': [
     { id: 'rh1', brand: 'Rhude', name: 'Cigarette Tee', price: 220, imageUrl: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
     { id: 'rh2', brand: 'Rhude', name: 'Cargo Pant', price: 575, imageUrl: 'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
     { id: 'rh3', brand: 'Rhude', name: 'Rhecess Hi', price: 300, imageUrl: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
  ],
  'Yeezy': [
     { id: 'yz1', brand: 'Yeezy', name: 'Slide Bone', price: 90, imageUrl: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
     { id: 'yz2', brand: 'Yeezy', name: 'Gap Hoodie', price: 100, imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
  ],
  'Amiri': [
      { id: 'am1', brand: 'Amiri', name: 'MA-1 Sneaker', price: 750, imageUrl: 'https://images.unsplash.com/photo-1605348532760-6753d2c43329?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
      { id: 'am2', brand: 'Amiri', name: 'MX1 Jeans', price: 1090, imageUrl: 'https://images.unsplash.com/photo-1542272454315-4c01d7abdf4a?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
      { id: 'am3', brand: 'Amiri', name: 'Core Logo Tee', price: 350, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' }
  ],
  'Rick Owens': [
      { id: 'ro1', brand: 'Rick Owens', name: 'Geobasket', price: 1200, imageUrl: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
      { id: 'ro2', brand: 'Rick Owens', name: 'Pod Shorts', price: 650, imageUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' },
      { id: 'ro3', brand: 'Rick Owens', name: 'Level Tee', price: 380, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=600', purchaseLink: '#' }
  ]
};
