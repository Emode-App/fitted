# Architectural Decisions

## 1. Frontend Framework
*   **React (SPA):** Chosen for component reusability and fast state updates.
*   **Tailwind CSS:** Used for rapid UI development. We utilize the `dark:` prefix strategy extensively to support a robust Dark Mode without CSS variable bloat.
*   **Lucide React:** Iconography library chosen for its clean, consistent stroke weights that match the "Fitted" minimalist aesthetic.

## 2. State Management: The "Mock DB" Pattern
Instead of Redux or Context API for everything, we implemented a **Service-based Observer Pattern** (`services/mockDb.ts`).

*   **Why?** It decouples the UI from the data source. Components subscribe to data changes (`subscribe()`).
*   **Benefit:** We can swap the contents of `mockDb.ts` with real API calls to a server *without* rewriting the React components. The components simply ask for `getUser(id)` or `getPosts()`, agnostic of whether that data comes from memory or a REST API.
*   **Reactivity:** When `addPost()` is called, the service notifies all listeners, causing the Feed, Profile, and Explore grids to update simultaneously.

## 3. UI/UX Decisions
*   **Mobile-First Layout:**
    *   Strict `overscroll-behavior-y: none` to prevent "bounce" on mobile browsers, making it feel like a native app.
    *   Bottom Navigation Bar is fixed.
    *   Touch targets are sized for thumbs (44px+).
*   **1:1 Aspect Ratio:**
    *   All posts are strictly square. This simplifies the layout logic and ensures consistency between the AI-generated result and the source "Board".
*   **Interaction Design:**
    *   **Snap Scrolling:** Used for the Post Carousel to mimic native iOS swiping behavior using CSS Scroll Snap.
    *   **Swipe-to-Reveal:** Custom touch event handling implemented in `Messages.tsx` for timestamps.
    *   **Modals:** Centralized `Modal` component used for everything from Shopping to Settings, ensuring z-index consistency (`z-50` to `z-[100]`).

## 4. AI Integration Strategy
*   **Client-side implementation (Prototype):** Currently, the app instantiates the `@google/genai` client directly in the browser.
*   **Prompt Engineering:** The prompt logic is encapsulated in `services/aiService.ts`. It constructs a multi-modal prompt sending the User's face (Base64) + Clothing Items (Base64) + Text Instructions to the `gemini-3-pro-image-preview` model.

## 5. Asset Management
*   **Hybrid Storage:**
    *   **Static Assets:** Brand logos and placeholder user avatars are stored as constant URLs.
    *   **User Uploads:** Converted to Blob URLs locally for the session. In production, these would be uploaded to an S3 bucket immediately, returning a URL to be stored in the DB.
