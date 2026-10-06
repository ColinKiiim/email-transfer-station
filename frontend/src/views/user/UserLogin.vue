<script setup>
import { useMessage } from 'naive-ui'
import { computed, onMounted, ref } from "vue";
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api';
import { useGlobalState } from '../../store'
import { hashPassword } from '../../utils';
import { createOAuthAttempt } from '../../security/oauth-state';
import { sanitizeOAuthIcon } from '../../security/safe-html';

import Turnstile from '../../components/Turnstile.vue';
import AppleSegmentedControl from '../../components/AppleSegmentedControl.vue';
import ApplePasswordInput from '../../components/ApplePasswordInput.vue';

const {
    userJwt, userOpenSettings, openSettings, loading
} = useGlobalState()
const message = useMessage();

const { t } = useScopedI18n('views.user.UserLogin')

const tabValue = ref("signin");
const showModal = ref(false);
const user = ref({
    email: "",
    password: "",
    code: ""
});
const signupCfToken = ref("")
const resetCfToken = ref("")
const loginCfToken = ref("")
const signupTurnstileRef = ref(null)
const resetTurnstileRef = ref(null)
const loginTurnstileRef = ref(null)

const segmentedOptions = computed(() => [
    { value: 'signin', label: t('login') },
    { value: 'signup', label: t('register') },
]);

const emailLogin = async () => {
    if (!user.value.email || !user.value.password) {
        message.error(t('pleaseInput'));
        return;
    }
    try {
        const res = await api.fetch(`/user_api/login`, {
            method: "POST",
            body: JSON.stringify({
                email: user.value.email,
                password: await hashPassword(user.value.password),
                cf_token: loginCfToken.value
            })
        });
        userJwt.value = res.jwt;
        location.reload();
    } catch (error) {
        message.error(error.message || "login failed");
        loginTurnstileRef.value?.refresh?.();
    }
};

const verifyCodeExpire = ref(0);
const verifyCodeTimeout = ref(0);

const getVerifyCodeTimeout = () => {
    if (!verifyCodeExpire.value || verifyCodeExpire.value < new Date().getTime()) return 0;
    return Math.round((verifyCodeExpire.value - new Date().getTime()) / 1000);
};

const sendVerificationCode = async () => {
    if (!user.value.email) {
        message.error(t('pleaseInputEmail'));
        return;
    }
    const currentCfToken = showModal.value ? resetCfToken.value : signupCfToken.value;
    if (openSettings.value.cfTurnstileSiteKey && !currentCfToken && userOpenSettings.value.enableMailVerify) {
        message.error(t('pleaseCompleteTurnstile'));
        return;
    }
    try {
        const res = await api.fetch(`/user_api/verify_code`, {
            method: "POST",
            body: JSON.stringify({
                email: user.value.email,
                cf_token: currentCfToken
            })
        });
        if (res && res.expirationTtl) {
            message.success(t('verifyCodeSent', { timeout: res.expirationTtl }));
            verifyCodeExpire.value = new Date().getTime() + res.expirationTtl * 1000;
            const intervalId = setInterval(() => {
                verifyCodeTimeout.value = getVerifyCodeTimeout();
                if (verifyCodeTimeout.value <= 0) {
                    clearInterval(intervalId);
                    verifyCodeTimeout.value = 0;
                }
            }, 1000);
        }
    } catch (error) {
        message.error(error.message || "send verification code failed");
    }
    if (showModal.value) {
        resetTurnstileRef.value?.refresh?.();
    } else {
        signupTurnstileRef.value?.refresh?.();
    }
};

const emailSignup = async () => {
    if (!user.value.email || !user.value.password) {
        message.error(t('pleaseInput'));
        return;
    }
    if (!user.value.code && userOpenSettings.value.enableMailVerify) {
        message.error(t('pleaseInputCode'));
        return;
    }
    try {
        const res = await api.fetch(`/user_api/register`, {
            method: "POST",
            body: JSON.stringify({
                email: user.value.email,
                password: await hashPassword(user.value.password),
                code: user.value.code,
                cf_token: showModal.value ? resetCfToken.value : signupCfToken.value
            })
        });
        if (res) {
            tabValue.value = "signin";
            message.success(t('pleaseLogin'));
        }
        showModal.value = false;
    } catch (error) {
        message.error(error.message || "register failed");
    }
};

const oauth2Login = async (clientID) => {
    try {
        const attempt = createOAuthAttempt({ clientID });
        const query = new URLSearchParams(attempt).toString();
        const res = await api.fetch(`/user_api/oauth2/login_url?${query}`);
        location.href = res.url;
    } catch (error) {
        message.error(error.message || "login failed");
    }
};
</script>

<template>
    <div class="user-auth-wrapper">
        <AppleSegmentedControl
            v-if="userOpenSettings.enable"
            v-model="tabValue"
            :options="segmentedOptions"
            :aria-label="t('login')"
        />

        <form v-if="tabValue === 'signin'" class="auth-form" @submit.prevent="emailLogin">
            <div class="auth-field">
                <label class="auth-label" for="user-login-email">{{ t('email') }}</label>
                <input id="user-login-email" v-model="user.email" class="auth-input" type="email" autocomplete="username"
                    placeholder="name@domain.com" />
            </div>
            <div class="auth-field">
                <label class="auth-label" for="user-login-password">{{ t('password') }}</label>
                <ApplePasswordInput id="user-login-password" v-model="user.password"
                    autocomplete="current-password" />
            </div>

            <Turnstile ref="loginTurnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="loginCfToken" />

            <button class="auth-submit-btn" type="submit" :disabled="loading">
                {{ t('login') }}
            </button>

            <div class="auth-aux-row">
                <button type="button" class="auth-aux-link forgot-btn" @click="showModal = true">
                    {{ t('forgotPassword') }}
                </button>
            </div>

            <div v-if="userOpenSettings.oauth2ClientIDs?.length" class="auth-separator">
                <span>{{ t('or') || '或' }}</span>
            </div>

            <div v-if="userOpenSettings.oauth2ClientIDs?.length" class="auth-alt-methods">
                <button type="button" @click="oauth2Login(item.clientID)" v-for="item in userOpenSettings.oauth2ClientIDs"
                    :key="item.clientID" class="oauth-btn">
                    <span v-if="item.icon" class="oauth2-icon" v-html="sanitizeOAuthIcon(item.icon)"></span>
                    <span>{{ t('loginWith', { provider: item.name }) }}</span>
                </button>
            </div>
        </form>

        <form v-else-if="tabValue === 'signup' && userOpenSettings.enable" class="auth-form" @submit.prevent="emailSignup">
            <div class="auth-field">
                <label class="auth-label" for="user-signup-email">{{ t('email') }}</label>
                <input id="user-signup-email" v-model="user.email" class="auth-input" type="email" autocomplete="username"
                    placeholder="name@domain.com" />
            </div>
            <div class="auth-field">
                <label class="auth-label" for="user-signup-password">{{ t('password') }}</label>
                <ApplePasswordInput id="user-signup-password" v-model="user.password"
                    autocomplete="new-password" />
            </div>

            <Turnstile ref="signupTurnstileRef" v-if="userOpenSettings.enableMailVerify" v-model:value="signupCfToken" />

            <div v-if="userOpenSettings.enableMailVerify" class="auth-field">
                <label class="auth-label" for="user-signup-code">{{ t('verifyCode') }}</label>
                <div style="display: flex; gap: 8px;">
                    <input id="user-signup-code" v-model="user.code" class="auth-input" type="text" placeholder="000000" style="flex: 1;" />
                    <button type="button" class="auth-submit-btn" style="width: auto; padding: 0 14px; margin-top: 0; font-size: 13px; white-space: nowrap;"
                        :disabled="verifyCodeTimeout > 0" @click="sendVerificationCode">
                        {{ verifyCodeTimeout > 0 ? t('waitforVerifyCode', { timeout: verifyCodeTimeout }) : t('sendVerificationCode') }}
                    </button>
                </div>
            </div>

            <Turnstile ref="signupTurnstileRef" v-if="!userOpenSettings.enableMailVerify" v-model:value="signupCfToken" />

            <button class="auth-submit-btn" type="submit" :disabled="loading">
                {{ t('register') }}
            </button>
        </form>

        <n-modal v-model:show="showModal" style="max-width: 480px;" preset="card" :title="t('forgotPassword')">
            <form v-if="userOpenSettings.enable && userOpenSettings.enableMailVerify" class="auth-form" @submit.prevent="emailSignup">
                <div class="auth-field">
                    <label class="auth-label" for="modal-reset-email">{{ t('email') }}</label>
                    <input id="modal-reset-email" v-model="user.email" class="auth-input" type="email" placeholder="name@domain.com" />
                </div>
                <div class="auth-field">
                    <label class="auth-label" for="modal-reset-password">{{ t('password') }}</label>
                    <ApplePasswordInput id="modal-reset-password" v-model="user.password"
                        autocomplete="new-password" />
                </div>
                <Turnstile ref="resetTurnstileRef" v-model:value="resetCfToken" />
                <div class="auth-field">
                    <label class="auth-label" for="modal-reset-code">{{ t('verifyCode') }}</label>
                    <div style="display: flex; gap: 8px;">
                        <input id="modal-reset-code" v-model="user.code" class="auth-input" type="text" placeholder="000000" style="flex: 1;" />
                        <button type="button" class="auth-submit-btn" style="width: auto; padding: 0 14px; margin-top: 0; font-size: 13px;"
                            :disabled="verifyCodeTimeout > 0" @click="sendVerificationCode">
                            {{ verifyCodeTimeout > 0 ? t('waitforVerifyCode', { timeout: verifyCodeTimeout }) : t('sendVerificationCode') }}
                        </button>
                    </div>
                </div>
                <button class="auth-submit-btn" type="submit">
                    {{ t('resetPassword') }}
                </button>
            </form>
            <n-alert v-else :show-icon="false" :bordered="false">
                <span>{{ t('cannotForgotPassword') }}</span>
            </n-alert>
            <template #footer>
                <n-button @click="showModal = false">{{ t('close') }}</n-button>
            </template>
        </n-modal>
    </div>
</template>

<style scoped>
.user-auth-wrapper {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.auth-separator {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 18px 0 14px;
    color: var(--ets-text-muted);
    font-size: 12px;
}

.auth-separator::before,
.auth-separator::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid var(--ets-border);
}

.auth-separator span {
    padding: 0 12px;
    opacity: 0.6;
}

.auth-alt-methods {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.oauth-btn {
    width: 100%;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: var(--ets-radius-md, 8px);
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    color: var(--ets-text);
    background: var(--ets-surface-sunken, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--ets-border);
    cursor: pointer;
    transition: background var(--ets-motion-fast, 120ms) ease;
}

.oauth-btn:hover {
    background: var(--ets-hover);
}

.oauth2-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
}

.oauth2-icon :deep(svg) {
    width: 100%;
    height: 100%;
}
</style>
