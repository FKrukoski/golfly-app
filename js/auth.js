/**
 * Module responsible for handling Supabase SDK setup, Login, and Registration.
 */

// We will inject the Supabase client via unpkg CDN in index.html
const SUPABASE_URL = 'https://ezxfxcnenamvqfpbkivt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6eGZ4Y25lbmFtdnFmcGJraXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Mzk1NTgsImV4cCI6MjA5MDMxNTU1OH0.yK--YAE8JKOsyidGKw3wCKWhNXbX6-WXKlC81caJHCc';

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

window.AuthApp = (function() {
    let currentUser = null;
    let userProfile = null;

    async function checkSession() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            currentUser = session.user;
            await loadProfile();
            return true;
        }
        return false;
    }

    async function loadProfile() {
        if (!currentUser) return;
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
            
        if (!error && data) {
            userProfile = data;
        }
    }

    async function login(email, password) {
        showLoading(true);
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        showLoading(false);
        if (error) {
            alert('Erro no login: ' + error.message);
            return false;
        }
        currentUser = data.user;
        await loadProfile();
        return true;
    }

    async function register(email, password) {
        showLoading(true);
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        showLoading(false);
        if (error) {
            alert('Erro no cadastro: ' + error.message);
            return false;
        }
        alert('Cadastro realizado com sucesso! Faça login para continuar.');
        return true;
    }

    async function logout() {
        await supabaseClient.auth.signOut();
        currentUser = null;
        userProfile = null;
        window.location.reload();
    }

    function getUser() {
        return currentUser;
    }

    function getProfile() {
        return userProfile;
    }

    function showLoading(show) {
        const btn = document.getElementById('auth-action-btn');
        if(btn) {
            btn.innerText = show ? 'Processando...' : 'Confirmar';
            btn.disabled = show;
        }
    }

    return {
        checkSession,
        login,
        register,
        logout,
        getUser,
        getProfile
    };
})();
