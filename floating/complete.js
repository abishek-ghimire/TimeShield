// complete.js — Timer/Focus completion popup handler
// Handles dismiss, auto-close, and 100+ rotating motivational quotes.

const motivationalQuotes = [
    // Focus & Productivity
    "The secret of getting ahead is getting started. — Mark Twain",
    "Focus on being productive instead of busy. — Tim Ferriss",
    "Don't watch the clock; do what it does. Keep going. — Sam Levenson",
    "Amateurs sit and wait for inspiration, the rest of us just get up and go to work. — Stephen King",
    "Either you run the day, or the day runs you. — Jim Rohn",
    "Efficiency is doing things right; effectiveness is doing the right things. — Peter Drucker",
    "Concentrate all your thoughts upon the work in hand. — Alexander Graham Bell",
    "The key is not to prioritize what's on your schedule, but to schedule your priorities. — Stephen Covey",
    "If you spend too much time thinking about a thing, you'll never get it done. — Bruce Lee",
    "One hour of focused work is worth more than three hours of scattered effort.",
    "Deep work is the superpower of the 21st century.",
    "Small, consistent actions build extraordinary results.",
    "Starve your distractions. Feed your focus.",
    "A year from now you'll wish you had started today. — Karen Lamb",
    "Don't count the minutes, make the minutes count.",
    "Simplicity is the ultimate sophistication. — Leonardo da Vinci",
    "The most productive person is not the busiest. They are the most intentional.",
    // Persistence & Grit
    "It always seems impossible until it's done. — Nelson Mandela",
    "Don't stop when you're tired. Stop when you're done. — David Goggins",
    "You don't have to be great to start, but you have to start to be great. — Zig Ziglar",
    "Success is not final, failure is not fatal: it is the courage to continue that counts. — Winston Churchill",
    "Tough times never last, but tough people do. — Robert H. Schuller",
    "The difference between ordinary and extraordinary is that little extra. — Jimmy Johnson",
    "Fall seven times and stand up eight. — Japanese Proverb",
    "Pain is temporary. Quitting lasts forever. — Lance Armstrong",
    "The goal is not to be perfect. The goal is to be better than yesterday.",
    "You have to believe in yourself when no one else does. — Serena Williams",
    "Hardships often prepare ordinary people for an extraordinary destiny. — C.S. Lewis",
    "It's not about how bad you want it. It's about how hard you're willing to work for it.",
    "Champions aren't born in gyms. Champions are built from what they have inside them. — Muhammad Ali",
    "Success is stumbling from failure to failure with no loss of enthusiasm. — Winston Churchill",
    // Mindset & Philosophy
    "The future depends on what you do today. — Mahatma Gandhi",
    "Your time is limited, so don't waste it living someone else's life. — Steve Jobs",
    "We are what we repeatedly do. Excellence, then, is not an act, but a habit. — Aristotle",
    "The only way to do great work is to love what you do. — Steve Jobs",
    "Whether you think you can or you think you can't, you're right. — Henry Ford",
    "Do what you can, with what you have, where you are. — Theodore Roosevelt",
    "Success usually comes to those who are too busy to be looking for it. — Henry David Thoreau",
    "The mind is everything. What you think you become. — Buddha",
    "Believe you can and you're halfway there. — Theodore Roosevelt",
    "Act as if what you do makes a difference. It does. — William James",
    "What you get by achieving your goals is not as important as what you become. — Henry David Thoreau",
    "Life is what happens when you're busy making other plans. — John Lennon",
    "In the middle of every difficulty lies opportunity. — Albert Einstein",
    "Opportunities don't happen. You create them. — Chris Grosser",
    "Dream big and dare to fail. — Norman Vaughan",
    "The only limit to our realization of tomorrow is our doubts of today. — Franklin D. Roosevelt",
    // Action & Discipline
    "The way to get started is to quit talking and begin doing. — Walt Disney",
    "Action is the foundational key to all success. — Pablo Picasso",
    "Motivation is what gets you started. Habit is what keeps you going. — Jim Ryun",
    "Discipline is the bridge between goals and accomplishment. — Jim Rohn",
    "Someday is not a day of the week. — Janet Dailey",
    "You miss 100% of the shots you don't take. — Wayne Gretzky",
    "Stop wishing. Start doing.",
    "Do something today that your future self will thank you for.",
    "Small daily improvements over time lead to stunning results. — Robin Sharma",
    "What you do today can improve all your tomorrows. — Ralph Marston",
    "Success doesn't come from what you do occasionally. It comes from what you do consistently.",
    "Don't wait for the perfect moment. Take the moment and make it perfect.",
    "Someday is a disease that will take your dreams to the grave with you. — Timothy Ferriss",
    "You are what you do, not what you say you'll do. — Carl Jung",
    "The secret to getting ahead is getting started.",
    "Do first, perfect later.",
    "A little progress each day adds up to big results.",
    "Done is better than perfect. — Facebook mantra",
    // Inspiration & Vision
    "Start where you are. Use what you have. Do what you can. — Arthur Ashe",
    "Everything you've ever wanted is on the other side of fear. — George Addair",
    "I attribute my success to this: I never gave or took any excuse. — Florence Nightingale",
    "Make each day your masterpiece. — John Wooden",
    "The only person you are destined to become is the person you decide to be. — Ralph Waldo Emerson",
    "All our dreams can come true, if we have the courage to pursue them. — Walt Disney",
    "Don't be pushed around by the fears in your mind. Be led by the dreams in your heart. — Roy T. Bennett",
    "Your passion is waiting for your courage to catch up. — Isabelle Lafleche",
    "Magic is believing in yourself. If you can do that, you can make anything happen. — Johann Wolfgang von Goethe",
    "It does not matter how slowly you go as long as you do not stop. — Confucius",
    "The best time to plant a tree was 20 years ago. The second best time is now. — Chinese Proverb",
    "Vision without execution is just hallucination. — Henry Ford",
    "Great things never came from comfort zones.",
    "Push yourself, because no one else is going to do it for you.",
    "Wake up with determination. Go to bed with satisfaction.",
    "Dream it. Believe it. Build it.",
    "Your only limit is your mind.",
    "Success is the sum of small efforts, repeated day in and day out. — Robert Collier",
    // Humor & Wit
    "The brain is a wonderful organ. It starts working the moment you get up in the morning and does not stop until you open a laptop. (Now close that YouTube tab.)",
    "Procrastination is the thief of time, collar him. — Charles Dickens",
    "The two most powerful warriors are patience and time. — Leo Tolstoy",
    "Work hard in silence. Let your success be the noise. — Frank Ocean",
    // Tech & Modern
    "Code is like humor. When you have to explain it, it's bad.",
    "The best error message is the one that never shows up. — Thomas Fuchs",
    "First, solve the problem. Then, write the code. — John Johnson",
    "Your most important work is always ahead of you, never behind you. — Stephen Covey",
    "Strive for progress, not perfection.",
    "Every expert was once a beginner.",
    "The road to success and the road to failure are almost exactly the same.",
    "Talent is cheaper than table salt. What separates the talented individual from the successful one is a lot of hard work. — Stephen King",
    "Be not afraid of going slowly. Be afraid only of standing still. — Chinese Proverb",
    "An investment in knowledge pays the best interest. — Benjamin Franklin",
    "The harder I work, the luckier I get. — Samuel Goldwyn",
    "Success is not the key to happiness. Happiness is the key to success. — Albert Schweitzer",
    "You don't have to see the whole staircase. Just take the first step. — Martin Luther King Jr.",
    "The only way to achieve the impossible is to believe it is possible. — Charles Kingsleigh",
    "Believe in the value of your work and the power of your discipline.",
    "Consistency converts ambition into achievement.",
    "You are capable of amazing things.",
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Dismiss button
    const dismissBtn = document.querySelector('.dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => window.close());
    }

    // 2. Auto-close after 8.5 seconds
    setTimeout(() => window.close(), 8500);

    // 3. Display random quote
    const quoteEl = document.getElementById('quote');
    if (quoteEl) {
        const idx = Math.floor(Math.random() * motivationalQuotes.length);
        quoteEl.textContent = `"${motivationalQuotes[idx]}"`;
    }

    // 4. Dynamic message from URL params
    const params = new URLSearchParams(window.location.search);
    const mins = params.get('mins');
    const type = params.get('type') || 'timer';
    const msgEl = document.getElementById('message');
    if (msgEl && mins) {
        if (document.title.includes('Focus')) {
            msgEl.textContent = `Outstanding! You stayed focused for ${mins} minutes.`;
        } else {
            msgEl.textContent = `Your ${mins}-minute ${type} session is complete!`;
        }
    }
});
