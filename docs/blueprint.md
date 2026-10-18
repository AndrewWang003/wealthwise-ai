# **App Name**: WealthWise AI

## Core Features:

- Secure Authentication: Implement secure user authentication using Google Sign-In via Firebase Authentication.
- Transaction Tracking: Record transactions (buy, sell, income, expense) with details like symbol, date, quantity, price, fee, currency, and notes in Firestore.
- Real-time Position Aggregation: Aggregate real-time positions data including Average Cost, Current Value, and Profit/Loss in Firestore, using a robust array-reduction method in TypeScript that mimics a 'Group By' operation on the Transaction collection.
- Multi-Currency Cash Management: Enforce 'Double-Entry' rule: Every 'Buy' action deducts the equivalent amount from the chosen currency account (AUD_CASH or USD_CASH) in a single atomic transaction. Trigger a user warning if the cash balance is insufficient.
- Exchange Rate Integration: Integrate ExchangeRate-API via Firebase Cloud Functions to fetch real-time USD/AUD rates.
- Natural Language Parsing: Utilize Gemini 2.5 Flash API tool to parse natural language inputs for transaction details (e.g., 'Bought 10 AAPL using my USD account'). If a user mentions common Australian tickers without a suffix, automatically suggest or append '.AX'.
- Interactive Data Visualization: Develop a modern, interactive dashboard with Recharts or Nivo, including Asset Allocation Pie Chart, Historical NAV Line Chart, and Profit/Loss bar chart per asset.
- Mobile-First PWA with Smart Nudge: Ensure a responsive mobile-first interface with a chat-focused input area and a 'Smart Nudge' for ASX assets: 'Reminder: Add .AX for Australian stocks.'
- Initial Balance Onboarding: Implement a wizard for users to input initial balances (AUD Cash, USD Cash, and existing stock holdings) upon first login.
- Data Portability (Export to CSV): Add a function in the Settings to export the entire transaction history to a CSV file.

## Style Guidelines:

- Primary color: Deep blue (#293462), evoking trust and intelligence, referencing wealth management and high finance without using cliché money-green.
- Background color: Light blue-gray (#E8EAF6) providing a neutral backdrop that highlights the charts, text, and other visual elements.
- Accent color: Soft purple (#8078B7), analogous to blue and shifting away from it in saturation and lightness, giving interactive components, charts, and actionable text the appropriate emphasis.
- Body and headline font: 'Inter', a grotesque sans-serif, will be used for its modern and neutral appearance, ensuring readability across various devices and screen sizes.
- Use minimalist icons to represent asset classes and transaction types.
- Emphasize a clean, data-rich dashboard layout.
- Subtle transitions and animations for interactive elements to enhance user engagement.