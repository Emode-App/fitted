# Emode

Emode (formerly Fitted) is the world's first AI-powered fashion try-on tool and social commerce platform. It is a mobile-first app that lets anyone see how clothing looks on THEM before they buy it, share their looks with a community, and shop or sell directly inside the app. It combines a generative-AI virtual try-on engine, a social feed built around outfits, and an integrated marketplace with built-in payments.

This repository contains the Emode mobile application (the fitted-mobile/ directory), built with Expo / React Native, along with the scaffolding for the wider Emode product including a web counterpart, a Supabase backend, and Stripe-powered payments.

## What is Emode?

Emode is two things at once. First, it is a product: an AI fashion try-on app and social marketplace where users create, discover, and shop outfits. Second, it is an appearance theme: Emode ships a signature warm, cream-toned UI theme (#F5F2EC) that sits alongside the standard Light and Dark modes. This "Emode" theme gives the app its distinctive editorial, paper-like aesthetic and is the brand's visual signature across web and mobile.

The name reflects the goal of putting you in "e-mode" -- an effortless, digital way to try on, style, and express fashion.

## What does it do?

### AI Virtual Try-On
Upload a photo of yourself (or use the camera) together with an outfit, and Emode's generative-AI engine renders a realistic image of you wearing it. No fitting rooms, no guesswork. It is powered by Google Gemini under the hood.

### Social Outfit Feed
A home feed, an Explore page, Trends, and Brands let users browse looks, follow creators, and get inspired. Outfits are first-class content you can post, save into drafts, and share.

### Create and Canvas
A creation studio lets users assemble looks on a canvas, run AI try-ons, and publish posts, with guided first-time tutorials for the Canvas, AI Try-On, and Marketplace features.

### Marketplace, Stylists and Payments
Users and businesses can sell items and offer styling services. Emode integrates Stripe Connect for seller onboarding and payouts, payment cards and requests, and RevenueCat for subscriptions, plus business badges, a shopping cart, and dynamic product categories.

### Messaging and Profiles
Direct messaging, rich user profiles with avatars, bios, links and even a favorite song, QR codes for sharing, and a guided onboarding flow round out the social experience.

### Themes
Light, Dark, and the signature Emode cream theme, with a centralized color system aligned between Emode Web and mobile.

## How will it benefit the world?

Emode is positioned as both a consumer product and a social enterprise, with benefits that extend beyond convenience.

Smarter, lower-regret shopping: by letting people realistically try clothes on before buying, Emode reduces uncertainty, returns, and impulse purchases that do not fit or suit the buyer.

Less waste and more sustainable fashion: fewer returns and fewer mistaken purchases mean less shipping, less packaging, and less clothing ending up unworn or in landfill, which addresses one of fashion's biggest environmental problems.

Inclusive try-on for everyone: virtual try-on works for every body type, size, and location, including people far from physical stores or underserved by traditional retail, making fashion more accessible.

Economic opportunity for creators and small businesses: a built-in marketplace, stylist services, business badges, and Stripe payouts let independent sellers, stylists, and small brands reach customers and earn income directly through the app.

A healthier relationship with self-expression: by making it easy and fun to experiment with style digitally, Emode encourages creativity and confidence without the pressure or cost of constant physical purchases.

## Tech Stack

App framework: Expo, React Native, and Expo Router.
Language: TypeScript.
State management: Zustand.
Backend: Supabase (auth, database, storage, and edge functions).
AI: Google Gemini via @google/genai.
Payments: Stripe Connect and RevenueCat.
UI: React Native SVG, Linear Gradient, Masked View, and Reanimated.

## Project Structure

The mobile app lives in fitted-mobile/ and is organized as follows: the app/ directory holds the Expo Router screens (tabs for home, explore, create, messages, and profile); components/ holds reusable UI; constants/ holds the color themes (Light, Dark, Emode), backgrounds, and payments config; services/ holds aiService, productSearch, stripeService, revenueCatService, and supabase; stores/ holds the Zustand state stores; supabase/ holds the edge functions and schema (Stripe Connect, payment intents, and webhooks); types/ holds shared TypeScript types; and walkthroughs/ holds the first-time tutorial content.

## Getting Started

Prerequisites: Node.js and the Expo CLI.

From the fitted-mobile directory, run npm install to install dependencies, then set your Supabase, Gemini, and Stripe keys in the .env file. Run npm run start, then press i for iOS, a for Android, or w for web.

## Status

Emode is under active development. Recent work includes onboarding and profile setup, first-time tutorials, the Emode cream theme, and Stripe and RevenueCat payments scaffolding.
