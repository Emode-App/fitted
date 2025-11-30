# Data Models

The application uses strict TypeScript interfaces to define the domain.

## User
Represents a user of the platform (Regular or Stylist).

```typescript
interface User {
  id: string;
  username: string;
  handle: string;
  avatarUrl: string;
  headerUrl?: string;        // Profile banner
  aiFaceUrl?: string;        // The "Face Reference" for AI generation
  isVerifiedStylist?: boolean;
  rate?: string;             // e.g. "$50 / fit"
  stats: {
    followers: number;
    following: number;
    fits: number;
  };
  // ... socials, bio, location
  favoriteBrand?: string;
  favoriteSong?: { ... };
}
```

## Post
The core unit of content.

```typescript
interface Post {
  id: string;
  user: User;
  generatedImage: string;    // URL to the AI result
  boardImage: string;        // URL (or null if dynamic) for the flatlay
  items: ClothingItem[];     // The items featured in the post
  music?: {                  // "Listening to..."
    title: string;
    artist: string;
    cover?: string;
  };
  backgroundConfig?: {       // How to render the board slide
    type: 'color' | 'image' | 'pattern';
    value: string;
  };
  // ... timestamps, likes
}
```

## ClothingItem
An individual asset uploaded by a user or selected from a brand.

```typescript
interface ClothingItem {
  id: string;
  brand: string;
  name: string;
  price: number;
  imageUrl: string;
  purchaseLink: string;
  // Position on the Create Canvas
  canvasState?: {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    isBgRemoved: boolean;
  };
}
```

## Wardrobe (Folder/Asset)
Organizes a user's uploaded items for reuse.

```typescript
interface Folder {
  id: string;
  name: string;
  assets: Asset[]; // { id, url, dateAdded }
  isDefault?: boolean;
}
```

## Interactions
*   **Comment:** Text replies attached to a Post.
*   **Notification:** System, Like, or Follow events.
*   **Message/Conversation:** DM data structures.
