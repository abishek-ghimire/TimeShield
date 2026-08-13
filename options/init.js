console.log("TimeShield: init.js running...");
document.addEventListener('DOMContentLoaded', () => {
    console.log("TimeShield: DOMContentLoaded");
    if (typeof OptionsManager !== 'undefined') {
        console.log("TimeShield: Instantiating OptionsManager");
        new OptionsManager();
    } else {
        console.error('TimeShield: OptionsManager is not defined!');
    }
});