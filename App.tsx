
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Feed } from './components/Feed';
import { Explore } from './components/Explore';
import { Create } from './components/Create';
import { Messages } from './components/Messages';
import { Profile } from './components/Profile';
import { Notifications } from './components/Notifications';
import { BrandPage } from './components/BrandPage';
import { TrendingPage } from './components/TrendingPage'; 
import { HashtagPage } from './components/HashtagPage';
import { FullPostView } from './components/FullPostView';
import { Post } from './types';
import { getAllPosts, subscribe } from './services/mockDb';

const SplashScreen = ({ isExiting }: { isExiting: boolean }) => (
  <div className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center transition-opacity duration-1000 ease-out ${isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
    <div className="text-white font-black text-6xl tracking-tighter animate-in zoom-in-50 duration-700">
      FITTED.
    </div>
  </div>
);

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [previousTab, setPreviousTab] = useState('home'); 
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);
  
  // Theme State - Default to 'light' as requested
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');

  // Navigation States
  const [viewedBrand, setViewedBrand] = useState<string | null>(null);
  const [viewedHashtag, setViewedHashtag] = useState<string | null>(null);
  const [initialChatUserId, setInitialChatUserId] = useState<string | null>(null);
  
  // Feed Tab State
  const [feedSelectedPost, setFeedSelectedPost] = useState<Post | null>(null);
  
  // Explore Tab State
  const [viewedTrend, setViewedTrend] = useState<{ name: string; image: string } | null>(null);
  const [exploreSelectedPost, setExploreSelectedPost] = useState<Post | null>(null);

  // Profile Tab State
  const [profileSelectedPost, setProfileSelectedPost] = useState<Post | null>(null);
  // Hashtag Page Post State
  const [hashtagSelectedPost, setHashtagSelectedPost] = useState<Post | null>(null);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(true);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<'menu' | 'editProfile'>('menu');

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setIsExiting(true);
    }, 2500);

    const timer2 = setTimeout(() => {
      setShowSplash(false);
    }, 3500);

    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, []);

  // Sync state on DB changes (handle deletions in open views)
  useEffect(() => {
      const unsubscribe = subscribe(() => {
          const posts = getAllPosts();
          
          if (feedSelectedPost && !posts.find(p => p.id === feedSelectedPost.id)) {
              setFeedSelectedPost(null);
          }
          if (exploreSelectedPost && !posts.find(p => p.id === exploreSelectedPost.id)) {
              setExploreSelectedPost(null);
          }
          if (profileSelectedPost && !posts.find(p => p.id === profileSelectedPost.id)) {
              setProfileSelectedPost(null);
          }
          if (hashtagSelectedPost && !posts.find(p => p.id === hashtagSelectedPost.id)) {
              setHashtagSelectedPost(null);
          }
      });
      return () => unsubscribe();
  }, [feedSelectedPost, exploreSelectedPost, profileSelectedPost, hashtagSelectedPost]);

  // Theme Logic
  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      if (theme === 'system') {
        root.classList.toggle('dark', mediaQuery.matches);
      } else {
        root.classList.toggle('dark', theme === 'dark');
      }
    };

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsNotificationsOpen(false);
    setViewedBrand(null);
    setViewedHashtag(null);
    setProfileSelectedPost(null);
    setExploreSelectedPost(null);
    setHashtagSelectedPost(null);
    setViewedTrend(null);
    if (tab === 'profile') {
        setViewedProfileId(null);
    }
    if (tab !== 'messages') {
        setInitialChatUserId(null); // Reset chat trigger when leaving
    }
  };

  const handleGoHome = () => {
      setActiveTab('home');
      setIsNotificationsOpen(false);
      setViewedBrand(null);
      setViewedHashtag(null);
      setFeedSelectedPost(null);
  };

  const handleViewProfile = (userId: string) => {
    if (activeTab !== 'profile') {
        setPreviousTab(activeTab);
    } else if (viewedProfileId === null) {
        setPreviousTab('profile');
    }
    setViewedProfileId(userId);
    setIsNotificationsOpen(false);
    setViewedBrand(null);
    // Don't clear hashtag view to allow back navigation ideally, but for now strict reset
    // setViewedHashtag(null); 
    setProfileSelectedPost(null);
    setActiveTab('profile');
  };

  const handleProfileBack = () => {
    setViewedProfileId(null);
    setActiveTab(previousTab);
  };

  const handleMessageUser = (userId: string) => {
      setInitialChatUserId(userId);
      setActiveTab('messages');
      setViewedProfileId(null); // Close profile view if open
  };

  const handleViewBrand = (brandName: string) => {
    setViewedBrand(brandName);
  };

  const handleViewHashtag = (hashtag: string) => {
    setViewedHashtag(hashtag);
  };

  const handleBrandBack = () => {
    setViewedBrand(null);
  };

  const handleHashtagBack = () => {
    setViewedHashtag(null);
  };

  const handleEditProfile = () => {
    setSettingsView('editProfile');
    setIsSettingsOpen(true);
  };

  const handleOpenSettings = () => {
    setSettingsView('menu');
    setIsSettingsOpen(true);
  };

  const handleOpenNotifications = () => {
    setIsNotificationsOpen(true);
    setHasUnreadNotifications(false);
  };

  // Explore Handlers
  const handleViewTrend = (name: string, image: string) => {
      setViewedTrend({ name, image });
  };

  const renderContent = () => {
    // Global Overlays (Brand Page, Hashtag Page, Notifications)
    
    // Hashtag Page Overlay
    if (viewedHashtag) {
        if (hashtagSelectedPost) {
             return <FullPostView 
                post={hashtagSelectedPost} 
                onBack={() => setHashtagSelectedPost(null)}
                onViewProfile={handleViewProfile}
                onViewBrand={handleViewBrand}
                onViewHashtag={handleViewHashtag}
            />;
        }
        return <HashtagPage 
            hashtag={viewedHashtag} 
            onBack={handleHashtagBack} 
            onOpenPost={setHashtagSelectedPost} 
        />;
    }

    if (viewedBrand) {
        return <BrandPage brandName={viewedBrand} onBack={handleBrandBack} />;
    }

    if (isNotificationsOpen) {
        return <Notifications onBack={() => setIsNotificationsOpen(false)} onViewProfile={handleViewProfile} />;
    }

    switch (activeTab) {
      case 'home': 
        return <Feed 
            onViewProfile={handleViewProfile} 
            onViewBrand={handleViewBrand}
            onViewHashtag={handleViewHashtag}
            selectedPost={feedSelectedPost}
            onOpenFullView={setFeedSelectedPost}
        />;
      
      case 'explore': 
        if (exploreSelectedPost) {
             return <FullPostView 
                post={exploreSelectedPost} 
                onBack={() => setExploreSelectedPost(null)}
                onViewProfile={handleViewProfile}
                onViewBrand={handleViewBrand}
                onViewHashtag={handleViewHashtag}
            />;
        }
        if (viewedTrend) {
            return <TrendingPage 
                trendName={viewedTrend.name} 
                coverImage={viewedTrend.image} 
                onBack={() => setViewedTrend(null)} 
                onOpenPost={setExploreSelectedPost}
            />;
        }
        return <Explore 
            onViewProfile={handleViewProfile} 
            onViewTrend={handleViewTrend}
            onOpenPost={setExploreSelectedPost}
            onViewHashtag={handleViewHashtag}
        />;

      case 'create': 
        return <Create onPublishSuccess={handleGoHome} />;
      case 'messages': 
        return <Messages 
            onViewProfile={handleViewProfile} 
            initialChatUserId={initialChatUserId}
        />;
      case 'profile': 
        // If a post is selected within profile tab, show full view
        if (profileSelectedPost) {
            return <FullPostView 
                post={profileSelectedPost} 
                onBack={() => setProfileSelectedPost(null)}
                onViewProfile={handleViewProfile}
                onViewBrand={handleViewBrand}
                onViewHashtag={handleViewHashtag}
            />;
        }
        return <Profile 
            userId={viewedProfileId || undefined} 
            onBack={viewedProfileId ? handleProfileBack : undefined}
            onEditProfile={handleEditProfile}
            onOpenPost={setProfileSelectedPost}
            onViewProfile={handleViewProfile}
            onMessage={handleMessageUser}
        />;
      default: 
        return <Feed 
            onViewProfile={handleViewProfile} 
            onViewBrand={handleViewBrand}
            onViewHashtag={handleViewHashtag}
            selectedPost={feedSelectedPost}
            onOpenFullView={setFeedSelectedPost}
        />;
    }
  };

  return (
    <>
      {showSplash && <SplashScreen isExiting={isExiting} />}
      
      <div className="min-h-screen bg-gray-100 dark:bg-zinc-950 flex justify-center animate-in fade-in duration-500">
        <Layout 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          onOpenNotifications={handleOpenNotifications}
          isSettingsOpen={isSettingsOpen}
          onCloseSettings={() => setIsSettingsOpen(false)}
          onOpenSettings={handleOpenSettings}
          settingsView={settingsView}
          scrollKey={`${activeTab}${viewedProfileId ? '-' + viewedProfileId : ''}${isNotificationsOpen ? '-notif' : ''}${viewedBrand ? '-' + viewedBrand : ''}${viewedHashtag ? '-' + viewedHashtag : ''}${feedSelectedPost ? '-' + feedSelectedPost.id : ''}${profileSelectedPost ? '-' + profileSelectedPost.id : ''}${exploreSelectedPost ? '-' + exploreSelectedPost.id : ''}${viewedTrend ? '-' + viewedTrend.name : ''}`}
          hasUnreadNotifications={hasUnreadNotifications}
          currentTheme={theme}
          setTheme={setTheme}
        >
          <div className="h-full">
            {renderContent()}
          </div>
        </Layout>
      </div>
    </>
  );
};

export default App;
