import React, { useState, useEffect, useRef } from 'react';
import { BadgeCheck, CheckCircle2, Search, ShieldCheck, ArrowLeft, Send } from 'lucide-react';
import { Modal, Button, TimeAgo } from './Shared';
import { getConversations, getMessages, sendMessage, subscribe, markConversationAsRead, findOrCreateConversation } from '../services/mockDb';
import { Conversation, Message } from '../types';
import { CURRENT_USER } from '../constants';

interface MessagesProps {
  onViewProfile?: (userId: string) => void;
  initialChatUserId?: string | null;
}

// Swipeable Message Row Component
const SwipeableMessage: React.FC<{ children: React.ReactNode; timestamp: React.ReactNode }> = ({ children, timestamp }) => {
  const [offset, setOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);

  // Unified Start Logic
  const handleStart = (clientX: number) => {
    setIsDragging(true);
    startX.current = clientX;
    setIsAnimating(false);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (clientX: number) => {
        const diff = startX.current - clientX;
        // Only allow left swipe (positive diff)
        // Max swipe reduced to 50px
        if (diff > 0) {
            setOffset(Math.min(diff, 50)); 
        } else {
            setOffset(0);
        }
    };

    const handleEnd = () => {
        setIsDragging(false);
        setIsAnimating(true);
        setOffset(0); // Snap back
    };

    // Global Listeners for Robustness
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onMouseUp = () => handleEnd();
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onTouchEnd = () => handleEnd();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging]);

  return (
    <div 
        className="relative overflow-hidden w-full group select-none touch-pan-y cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => handleStart(e.clientX)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
    >
       <div 
          className="relative z-10 bg-inherit"
          style={{ 
              transform: `translateX(-${offset}px)`,
              transition: isAnimating ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
          }}
       >
          {children}
       </div>
       <div 
          className="absolute inset-y-0 right-0 w-[50px] flex items-center justify-center text-[10px] text-gray-400 dark:text-zinc-500 font-medium z-0"
          style={{ opacity: offset > 10 ? 1 : 0, transition: 'opacity 0.2s' }}
       >
          {timestamp}
       </div>
    </div>
  );
};

export const Messages: React.FC<MessagesProps> = ({ onViewProfile, initialChatUserId }) => {
  const [showVerification, setShowVerification] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial fetch
    setConversations(getConversations());
    
    const unsubscribe = subscribe(() => {
        setConversations(getConversations());
        if (activeConversation) {
            setMessages(getMessages(activeConversation.id));
        }
    });
    return () => unsubscribe();
  }, [activeConversation]);

  // Handle external navigation to a chat
  useEffect(() => {
      if (initialChatUserId) {
          const convId = findOrCreateConversation(initialChatUserId);
          const conv = getConversations().find(c => c.id === convId);
          if (conv) {
              handleOpenChat(conv);
          }
      }
  }, [initialChatUserId]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeConversation]);

  const handleOpenChat = (conv: Conversation) => {
      setActiveConversation(conv);
      setMessages(getMessages(conv.id));
      markConversationAsRead(conv.id);
      // Reset scroll immediately without animation first
      setTimeout(() => messagesEndRef.current?.scrollIntoView(), 0);
  };

  const handleSend = () => {
      if (!newMessage.trim() || !activeConversation) return;
      sendMessage(activeConversation.id, newMessage);
      setNewMessage('');
  };

  const handleProfileClick = (e: React.MouseEvent, userId?: string) => {
    if (userId && onViewProfile) {
        e.stopPropagation();
        onViewProfile(userId);
    }
  };

  // --- CHAT VIEW ---
  if (activeConversation) {
      const partner = activeConversation.participants.find(p => p.id !== CURRENT_USER.id);
      
      return (
          <div className="flex flex-col min-h-full bg-white dark:bg-black transition-colors duration-200">
              {/* Chat Header */}
              <div className="h-16 border-b border-gray-100 dark:border-zinc-800 flex items-center px-4 gap-3 shrink-0 sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur z-20 animate-in slide-in-from-right">
                  <button onClick={() => setActiveConversation(null)} className="p-2 -ml-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-full text-black dark:text-white">
                      <ArrowLeft size={24} />
                  </button>
                  <div className="relative cursor-pointer" onClick={(e) => handleProfileClick(e, partner?.id)}>
                      <img src={partner?.avatarUrl} className="w-10 h-10 rounded-full object-cover bg-gray-200 dark:bg-zinc-800" alt={partner?.username} />
                      {partner?.showActivityStatus && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>
                      )}
                  </div>
                  <div className="cursor-pointer" onClick={(e) => handleProfileClick(e, partner?.id)}>
                      <div className="font-bold text-sm text-black dark:text-white flex items-center gap-1">
                          {partner?.username}
                          {partner?.isVerifiedStylist && <BadgeCheck size={14} className="text-blue-500 fill-blue-50 dark:fill-blue-900" />}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-zinc-500">{partner?.showActivityStatus ? 'Active now' : 'Offline'}</div>
                  </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 p-4 space-y-4 bg-gray-50 dark:bg-zinc-900/50 min-h-0 overflow-x-hidden animate-in slide-in-from-right">
                  {messages.map((msg) => {
                      const isMe = msg.senderId === CURRENT_USER.id;
                      return (
                          <SwipeableMessage 
                            key={msg.id} 
                            timestamp={<TimeAgo timestamp={msg.createdAt} staticText={msg.timestamp} format="time" />}
                          >
                            <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                {!isMe && (
                                    <img 
                                        src={partner?.avatarUrl} 
                                        className="w-8 h-8 rounded-full object-cover bg-gray-200 dark:bg-zinc-800 mr-2 self-end mb-1 cursor-pointer" 
                                        alt="avatar"
                                        onClick={(e) => handleProfileClick(e, partner?.id)}
                                    />
                                )}
                                <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                    isMe 
                                    ? 'bg-blue-600 text-white rounded-br-none' 
                                    : 'bg-white dark:bg-zinc-800 text-gray-800 dark:text-zinc-200 border border-gray-100 dark:border-zinc-700 rounded-bl-none shadow-sm'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                          </SwipeableMessage>
                      );
                  })}
                  <div ref={messagesEndRef} />
              </div>

              {/* Input Area - Sticky Bottom */}
              <div className="p-3 bg-white dark:bg-black border-t border-gray-100 dark:border-zinc-800 shrink-0 sticky bottom-0 z-10">
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-900 rounded-full px-2 py-1.5">
                      <input 
                        type="text" 
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Message..." 
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 focus:outline-none text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-zinc-600"
                      />
                      <button 
                        onClick={handleSend}
                        disabled={!newMessage.trim()}
                        className="p-2 bg-blue-600 text-white rounded-full disabled:opacity-50 disabled:bg-gray-300 dark:disabled:bg-zinc-700 transition-all hover:scale-105 active:scale-95"
                      >
                          <Send size={16} />
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // --- INBOX VIEW ---
  return (
    <div className="px-4 py-4 pb-24 w-full min-h-full flex flex-col bg-white dark:bg-black transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 h-10 shrink-0">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Messages</h1>
        <button 
            onClick={() => setShowVerification(true)}
            className="group active:scale-95 transition-transform outline-none"
        >
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50">
                <BadgeCheck size={18} strokeWidth={2.5} />
            </div>
        </button>
      </div>

      <div className="relative mb-4 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input 
          type="text" 
          placeholder="Search DMs..." 
          className="w-full bg-gray-100 dark:bg-zinc-900 text-black dark:text-white rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-black/5 dark:focus:ring-white/10"
        />
      </div>

      <div className="flex-1 flex flex-col space-y-1">
         {conversations.length === 0 && (
             <div className="text-center py-10 text-gray-400 dark:text-zinc-600 text-sm">No messages yet.</div>
         )}
         {conversations.map((conv) => {
             const partner = conv.participants.find(p => p.id !== CURRENT_USER.id);
             return (
                 <div 
                    key={conv.id} 
                    onClick={() => handleOpenChat(conv)}
                    className="group flex gap-4 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer active:scale-[0.99] transition-all items-start relative"
                 >
                     <div 
                        className="relative shrink-0 cursor-pointer"
                        onClick={(e) => handleProfileClick(e, partner?.id)}
                     >
                        <img src={partner?.avatarUrl} className="w-14 h-14 rounded-full bg-gray-200 dark:bg-zinc-800 object-cover border border-gray-100 dark:border-zinc-700 group-hover:border-white transition-colors" alt="user" />
                        {partner?.showActivityStatus && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>}
                     </div>
                     
                     <div className="flex-1 min-w-0 border-b border-gray-100 dark:border-zinc-800 pb-4 group-hover:border-transparent transition-colors">
                         <div className="flex justify-between items-baseline mb-0.5">
                             <div className="flex items-center gap-1 truncate pr-2">
                                 <span className="font-bold text-sm text-black dark:text-white truncate">{partner?.username}</span>
                                 {partner?.isVerifiedStylist && <BadgeCheck size={12} className="text-blue-500 fill-blue-50 dark:fill-blue-900 shrink-0" />}
                             </div>
                             <span className={`text-xs whitespace-nowrap shrink-0 ${conv.unreadCount > 0 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-zinc-600 font-medium'}`}>
                                 <TimeAgo timestamp={conv.lastMessage.createdAt} staticText={conv.lastMessage.timestamp} />
                             </span>
                         </div>
                         <div className="flex justify-between items-center">
                            <p className={`text-sm truncate pr-2 ${conv.unreadCount > 0 ? 'text-black dark:text-white font-bold' : 'text-gray-500 dark:text-zinc-500'}`}>
                                {conv.lastMessage.senderId === CURRENT_USER.id && <span className="text-gray-400 dark:text-zinc-600 font-normal mr-1">You:</span>}
                                {conv.lastMessage.text}
                            </p>
                            {conv.unreadCount > 0 && (
                                <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow-sm shadow-blue-200 shrink-0">
                                    {conv.unreadCount}
                                </div>
                            )}
                         </div>
                     </div>
                 </div>
             );
         })}
      </div>

      {/* Verification Modal */}
      <Modal isOpen={showVerification} onClose={() => setShowVerification(false)}>
         <div className="text-center text-black dark:text-white">
             <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-400">
                 <ShieldCheck size={32} />
             </div>
             <h2 className="text-2xl font-black mb-2">Become a Verified Stylist</h2>
             <p className="text-gray-500 dark:text-zinc-400 mb-6 text-sm leading-relaxed px-4">
                Unlock professional tools and start earning from your style.
             </p>
             
             <div className="bg-gray-50 dark:bg-zinc-800 p-5 rounded-xl mb-6 text-left border border-gray-100 dark:border-zinc-700">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-zinc-700 pb-2">
                    <span className="font-bold">Stylist Subscription</span>
                    <span className="font-bold text-xl">$25<span className="text-xs font-normal text-gray-400">/mo</span></span>
                </div>
                <ul className="text-xs text-gray-600 dark:text-zinc-400 space-y-2.5 font-medium">
                    <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-blue-500" />
                        Blue Verified Badge on profile
                    </li>
                    <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-blue-500" />
                        Process payments directly in DMs
                    </li>
                    <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-blue-500" />
                        Rank on the "Featured Stylists" leaderboard
                    </li>
                </ul>
             </div>

             <Button variant="purple" className="w-full">Purchase Verification</Button>
         </div>
      </Modal>
    </div>
  );
};