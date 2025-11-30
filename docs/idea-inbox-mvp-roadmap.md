# Fitted: Idea Inbox & MVP Roadmap

## 1. What We Are Doing
**Fitted** is a mobile-first social fashion application that leverages generative AI (Google's "Nano Banana Pro" / Gemini 3 Pro Image) to solve the "dressing room" problem digitally.

The core value proposition is **Hyper-realistic Visualization**:
1.  Users upload their clothing items (flatlays/stock photos).
2.  Users upload a reference photo of their face.
3.  The AI generates a photo of *the user wearing those specific items* in a scene of their choice.

Beyond the tool, Fitted is a **Social Network**:
*   Users post their generated "Fits".
*   Items are tagged and shoppable (StockX, GOAT, Grailed integration).
*   Stylists can monetize their taste by getting "Verified" and offering paid styling services via DMs.

## 2. What Works (Current MVP Status)

The application is currently a **High-Fidelity Interactive Prototype** running on React. It simulates a fully functional backend using a local reactive database pattern.

### Core Flows
-   **Authentication (Simulated):** Auto-login as a specific mock user (`CURRENT_USER`).
-   **Feed:**
    -   Scrollable timeline of posts.
    -   **Slide Interaction:** Swipe (snap-scroll) between the AI-generated fit and the flatlay board.
    -   **Live Metadata:** "Wearing..." text loops with "Listening to..." music metadata.
    -   **Actions:** Double-tap to like, comment, share, and bookmark.
    -   **Shop:** Clicking the image reveals tags; clicking items opens a purchase modal with dynamic deep links.
-   **Create Fit (The Canvas):**
    -   **Wardrobe Management:** Upload items to folders (Last Used, Shirts, Shoes, etc.).
    -   **Drag & Drop Editor:** Position items on a square canvas.
    -   **Backgrounds:** Select colors, patterns (Grid), or textures (Concrete, Felt).
    -   **AI Integration:** Wired to `services/aiService.ts` to call Gemini API (requires API Key).
    -   **Metadata:** Add caption, music, and specific shop links before publishing.
-   **Profile:**
    -   **Stats:** Real-time calculation of Followers, Following, and Fits based on the mock DB.
    -   **Favorites:** Display Favorite Brand (Heart Hands) and Favorite Song (playable link).
    -   **Social Graph:** Clickable Follower/Following lists.
    -   **Face Data:** Upload UI for the AI reference photo.
-   **Explore:**
    -   **Trending:** Curated "Trending Now" styles.
    -   **Leaderboard:** Featured Stylists carousel.
    -   **Grid:** Chronological view of all public posts.
-   **Messages (DMs):**
    -   **Real-time UI:** Messages appear instantly.
    -   **UX:** Swipe-left on bubbles to reveal exact timestamps.
    -   **Stylist Integration:** Verified badge and rate display within chat headers.
-   **Settings & Customization:**
    -   **Theme:** Fully functional **Dark Mode**, Light Mode, and System sync.
    -   **Account:** Edit Profile (Bio, Header, Socials), Privacy toggles, 2FA UI simulation.

## 3. Roadmap & Next Steps

### Phase 1: Backend Connection (Immediate)
*   **Migration:** Move `services/mockDb.ts` logic to a real backend (Supabase or Firebase).
*   **Auth:** Implement real Authentication (JWT, OAuth with Apple/Google).
*   **Storage:** Connect Image uploads (User assets, generated images) to cloud storage (AWS S3 or Supabase Storage).

### Phase 2: AI Refinement
*   **Segmentation:** Implement real background removal API (e.g., rembg) for uploaded clothing items before they hit the canvas.
*   **Queueing:** Move AI generation to a server-side queue to handle latency and rate limits gracefully.

### Phase 3: Monetization (The Stylist Economy)
*   **Stripe Connect:** Allow Stylists to onboard and receive payouts.
*   **Payments:** Implement "Pay to Unlock Fit" or "Pay for Styling" in DMs.

### Phase 4: Social Graph Growth
*   **Search:** Implement real fuzzy search for users, brands, and items (currently mocked).
*   **Activity:** Real push notifications for likes/follows.
