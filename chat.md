I have created the implementation plan covering the cloud sync engine, authentication REST client, consolidated scheduler, day checkboxes, and light mode visual fixes.

Please review the 
implementation_plan.md
 and let me know if you approve so I can begin execution.

Implementation Plan
8:32 PM
Proceeded with
Implementation Plan
I will create the tracking task list task.md in the artifacts directory.

Task
I will create utils/firebase-auth.js to handle all authentication REST API requests to Firebase.

firebase-auth.js
I will create utils/sync-service.js to coordinate the cloud synchronization engine. It handles debouncing, offline queueing, conflict resolution, session refresh, and status updates.

sync-service.js
I will update task.md to show that the Sync & Authentication services have been created.

Task
I will search for chrome.storage.onChanged inside background/service-worker.js to see if there is any existing storage change listener there.

I will view the rest of the enableSiteBlocking method in background/service-worker.js (lines 1245 to 1345) to see the full logic of the rule compilers and DNR actions.

I will search the project for sleepBlockingState to see where it is used.

I will view lines 1 to 75 of background/service-worker.js to see the exact structure of import statements and constructor initialization.

I will search for initializeStorage inside background/service-worker.js to see what initial values it populates.

I will view the end of the background/service-worker.js file to see how storage is initialized.

I will view lines 525 to 655 of background/service-worker.js to see the exact message handler logic so I can write a precise drop-in replacement.

I will perform multiple replacements inside background/service-worker.js to integrate the sync service, remove sleep/night blocking, handle dynamic sync events, and add migration logic on startup.

service-worker.js
I will search for settingsUpdated in background/service-worker.js to find the exact line numbers after the first set of replacements.

I will view lines 635 to 665 in background/service-worker.js.

I will replace the deprecated sleep blocking messages with cloud authentication and sync message handlers in background/service-worker.js.

service-worker.js
I will search for isSleepBlockingActive in background/service-worker.js to see where it and the other sleep blocking functions are implemented.

I will view background/service-worker.js from line 785 to line 865 to inspect the sleep-blocking helper methods.

I will view lines 865 to 900 of background/service-worker.js to see how redirectAllTabs is finished.

I will search for isSiteBlocked in background/service-worker.js to find its exact line numbers.

I will view background/service-worker.js around isSiteBlocked (lines 950 to 995) to see the exact structure.

I will replace the deprecated sleep blocking functions with the updated unified scheduled blocking function in background/service-worker.js.

service-worker.js
I will search for isSiteBlocked in background/service-worker.js to get its new line numbers.

I will view lines 900 to 950 in background/service-worker.js to see the exact structure of isSiteBlocked().

I will update isSiteBlocked() and implement the settings migration script migrateOldSettings() in background/service-worker.js.

service-worker.js
I will view floating/schedule-block.html to understand how the scheduled blocking display page is structured.

schedule-block.html#L1-352
