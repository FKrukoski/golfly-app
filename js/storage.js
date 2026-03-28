/**
 * Storage Abstraction using LocalForage
 * Handles CRUD operations for our MVP entities (Courses, Matches, Settings)
 */

window.db = (function() {
    // Initialize stores
    const courseStore = localforage.createInstance({ name: 'GolfApp', storeName: 'courses' });
    const matchStore = localforage.createInstance({ name: 'GolfApp', storeName: 'matches' });
    const activeMatchStore = localforage.createInstance({ name: 'GolfApp', storeName: 'activeMatch' });

    return {
        // Courses CRUD
        async getCourses() {
            const courses = [];
            await courseStore.iterate((value) => { courses.push(value); });
            return courses;
        },
        async saveCourse(course) {
            if (!course.id) course.id = `course_${Date.now()}`;
            await courseStore.setItem(course.id, course);
            return course;
        },
        async deleteCourse(id) {
            await courseStore.removeItem(id);
        },
        async getCourse(id) {
            return await courseStore.getItem(id);
        },
        async deleteCourse(id) {
            await courseStore.removeItem(id);
        },

        // Matches CRUD
        async getMatches() {
            const matches = [];
            await matchStore.iterate((value) => { matches.push(value); });
            return matches.sort((a,b) => b.date - a.date);
        },
        async saveMatch(match) {
            if (!match.id) match.id = `match_${Date.now()}`;
            await matchStore.setItem(match.id, match);
            return match;
        },

        // Active Match State
        async getActiveMatch() {
            return await activeMatchStore.getItem('current');
        },
        async setActiveMatch(match) {
            await activeMatchStore.setItem('current', match);
        },
        async clearActiveMatch() {
            await activeMatchStore.removeItem('current');
        }
    };
})();
