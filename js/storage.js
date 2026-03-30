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
            
            // Push Sync
            if (window.AuthApp && window.AuthApp.getUser() && window.supabaseClient) {
                const user = window.AuthApp.getUser();
                const payload = {
                    id: course.id,
                    name: course.name || '',
                    city: course.city || '',
                    physical_holes: course.physicalHoles || 18,
                    total_par: course.totalPar || 0,
                    holes: course.holes || [],
                    offline_map: course.offlineMap || null,
                    created_by: user.id
                };
                window.supabaseClient.from('courses').upsert(payload, { onConflict: 'id' }).then().catch(e => console.error(e));
            }
            return course;
        },
        async deleteCourse(id) {
            await courseStore.removeItem(id);
            if (window.supabaseClient && window.AuthApp && window.AuthApp.getUser()) {
                 window.supabaseClient.from('courses').delete().eq('id', id).then().catch(e => console.error(e));
            }
        },
        async getCourse(id) {
            return await courseStore.getItem(id);
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
            
            // Push Sync
            if (match.finished && window.AuthApp && window.AuthApp.getUser() && window.supabaseClient) {
                const user = window.AuthApp.getUser();
                const payload = {
                    id: match.id,
                    course_id: match.courseId || null,
                    match_state: match,
                    user_id: user.id
                };
                window.supabaseClient.from('matches').upsert(payload, { onConflict: 'id' }).then().catch(e => console.error(e));
            }
            return match;
        },
        async deleteMatch(id) {
            await matchStore.removeItem(id);
            if (window.AuthApp && window.AuthApp.getUser() && window.supabaseClient) {
                window.supabaseClient.from('matches').delete().eq('id', id).then().catch(e => console.error(e));
            }
        },
        async getMatch(id) {
            return await matchStore.getItem(id);
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
        },
        
        // Supabase Background Pull
        async syncPullCourses() {
             if (!window.AuthApp || !window.supabaseClient) return;
             const user = window.AuthApp.getUser();
             if (!user) return;
             
             try {
                 const { data, error } = await window.supabaseClient.from('courses').select('*');
                 if (error) throw error;
                 
                 if (data && data.length > 0) {
                     for(let row of data) {
                         const localObj = {
                             id: row.id,
                             name: row.name,
                             city: row.city,
                             physicalHoles: row.physical_holes,
                             totalPar: row.total_par,
                             holes: row.holes || [],
                             offlineMap: row.offline_map || null
                         };
                         await courseStore.setItem(row.id, localObj);
                     }
                 }
             } catch(e) {
                 console.error("Erro no Pull Supabase:", e);
             }
        },

        // Request Management
        async sendCourseRequest(courseName, location) {
            if (!window.supabaseClient || !window.AuthApp.getUser()) return;
            const user = window.AuthApp.getUser();
            await window.supabaseClient.from('course_requests').insert({
                user_id: user.id,
                course_name: courseName,
                location: location
            });
        },

        async sendAdminRequest(reason) {
           if (!window.supabaseClient || !window.AuthApp.getUser()) return;
           const user = window.AuthApp.getUser();
           await window.supabaseClient.from('admin_requests').insert({
               user_id: user.id,
               reason: reason
           });
        },

        async getPendingRequests(table) {
            if (!window.AuthApp.isAdmin()) return [];
            const { data } = await window.supabaseClient
               .from(table)
               .select('*, profiles(email)')
               .eq('status', 'pending');
            return data || [];
        },

        async updateRequestStatus(table, id, status, userId = null) {
            if (!window.AuthApp.isAdmin()) return;
            const { error } = await window.supabaseClient
               .from(table)
               .update({ status })
               .eq('id', id);
            
            // If admin promotion is approved, update the profile role
            if (!error && table === 'admin_requests' && status === 'approved' && userId) {
                await window.supabaseClient
                   .from('profiles')
                   .update({ role: 'admin' })
                   .eq('id', userId);
            }
        }
    };
})();
