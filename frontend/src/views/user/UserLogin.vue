<script setup>
import { useMessage } from 'naive-ui'
import { onMounted, ref } from "vue";
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api';
import { useGlobalState } from '../../store'
import { hashPassword } from '../../utils';
import { createOAuthAttempt } from '../../security/oauth-state';
import { sanitizeOAuthIcon } from '../../security/safe-html';

import Turnstile from '../../components/Turnstile.vue';

const {
    userJwt, userOpenSettings, openSettings
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
                // hash password
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
                // hash password
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
        // redirect to oauth2 login page
        location.href = res.url;
    } catch (error) {
        message.error(error.message || "login failed");
    }
};

onMounted(async () => {

});
</script>

<template>
    <div class="user-auth-wrapper">
        <n-tabs v-model:value="tabValue" size="large" justify-content="space-evenly" class="auth-tabs">
            <n-tab-pane name="signin" :tab="t('login')">
                <n-form class="auth-form">
                    <n-form-item-row :label="t('email')" required>
                        <n-input v-model:value="user.email" placeholder="name@domain.com" size="large" />
                    </n-form-item-row>
                    <n-form-item-row :label="t('password')" required>
                        <n-input v-model:value="user.password" type="password" show-password-on="click"
                            placeholder="••••••••" size="large" @keyup.enter="emailLogin" />
                    </n-form-item-row>
                    <Turnstile ref="loginTurnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="loginCfToken" />

                    <div class="auth-action-row">
                        <n-button @click="emailLogin" type="primary" block size="large" class="submit-btn" strong>
                            {{ t('login') }}
                        </n-button>
                    </div>

                    <div class="auth-aux-row">
                        <n-button @click="showModal = true" type="info" quaternary size="small" class="forgot-btn">
                            {{ t('forgotPassword') }}
                        </n-button>
                    </div>

                    <div v-if="userOpenSettings.oauth2ClientIDs?.length" class="auth-separator">
                        <span>{{ t('or') || '或' }}</span>
                    </div>

                    <div v-if="userOpenSettings.oauth2ClientIDs?.length" class="auth-alt-methods">
                        <n-button @click="oauth2Login(item.clientID)" v-for="item in userOpenSettings.oauth2ClientIDs"
                            :key="item.clientID" block secondary size="large" class="oauth-btn" strong>
                            <template #icon v-if="item.icon">
                                <span class="oauth2-icon" v-html="sanitizeOAuthIcon(item.icon)"></span>
                            </template>
                            {{ t('loginWith', { provider: item.name }) }}
                        </n-button>
                    </div>
                </n-form>
            </n-tab-pane>
            <n-tab-pane v-if="userOpenSettings.enable" name="signup" :tab="t('register')">
                <n-form class="auth-form">
                    <n-form-item-row :label="t('email')" required>
                        <n-input v-model:value="user.email" placeholder="name@domain.com" size="large" />
                    </n-form-item-row>
                    <n-form-item-row :label="t('password')" required>
                        <n-input v-model:value="user.password" type="password" show-password-on="click"
                            placeholder="••••••••" size="large" @keyup.enter="emailSignup" />
                    </n-form-item-row>
                    <Turnstile ref="signupTurnstileRef" v-if="userOpenSettings.enableMailVerify" v-model:value="signupCfToken" />
                    <n-form-item-row v-if="userOpenSettings.enableMailVerify" :label="t('verifyCode')" required>
                        <n-input-group size="large">
                            <n-input v-model:value="user.code" placeholder="000000" />
                            <n-button @click="sendVerificationCode" type="primary" ghost
                                :disabled="verifyCodeTimeout > 0">
                                {{ verifyCodeTimeout > 0 ? t('waitforVerifyCode', { timeout: verifyCodeTimeout })
                                    : t('sendVerificationCode') }}
                            </n-button>
                        </n-input-group>
                    </n-form-item-row>
                    <Turnstile ref="signupTurnstileRef" v-if="!userOpenSettings.enableMailVerify" v-model:value="signupCfToken" />

                    <div class="auth-action-row">
                        <n-button @click="emailSignup" type="primary" block size="large" class="submit-btn" strong>
                            {{ t('register') }}
                        </n-button>
                    </div>
                </n-form>
            </n-tab-pane>
        </n-tabs>
        <n-modal v-model:show="showModal" style="max-width: 520px;" preset="card" :title="t('forgotPassword')">
            <n-form v-if="userOpenSettings.enable && userOpenSettings.enableMailVerify">
                <n-form-item-row :label="t('email')" required>
                    <n-input v-model:value="user.email" placeholder="name@domain.com" />
                </n-form-item-row>
                <n-form-item-row :label="t('password')" required>
                    <n-input v-model:value="user.password" type="password" show-password-on="click"
                        placeholder="••••••••" @keyup.enter="emailSignup" />
                </n-form-item-row>
                <Turnstile ref="resetTurnstileRef" v-model:value="resetCfToken" />
                <n-form-item-row :label="t('verifyCode')" required>
                    <n-input-group>
                        <n-input v-model:value="user.code" placeholder="000000" />
                        <n-button @click="sendVerificationCode" style="margin-bottom: 0" type="primary" ghost
                            :disabled="verifyCodeTimeout > 0">
                            {{ verifyCodeTimeout > 0 ? t('waitforVerifyCode', { timeout: verifyCodeTimeout })
                                : t('sendVerificationCode') }}
                        </n-button>
                    </n-input-group>
                </n-form-item-row>
                <n-button @click="emailSignup" type="primary" block secondary strong>
                    {{ t('resetPassword') }}
                </n-button>
            </n-form>
            <n-alert v-else :show-icon="false" :bordered="false">
                <span>
                    {{ t('cannotForgotPassword') }}
                </span>
            </n-alert>
        </n-modal>
    </div>
</template>

<style scoped>
.user-auth-wrapper {
    width: 100%;
}

.auth-tabs :deep(.n-tabs-nav) {
    margin-bottom: 18px;
}

.auth-form {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.auth-action-row {
    margin-top: 12px;
}

.submit-btn {
    height: 42px;
    font-size: 15px;
    font-weight: 700;
    border-radius: 8px;
}

.auth-aux-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
}

.forgot-btn {
    font-size: 12.5px;
    color: var(--ets-text-muted);
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
    gap: 10px;
}

.oauth-btn {
    height: 40px;
    border-radius: 8px;
    font-size: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--ets-border);
}

.oauth-btn:hover {
    background: rgba(255, 255, 255, 0.08);
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
