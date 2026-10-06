<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'

import AdminContact from '../common/AdminContact.vue'
import Turnstile from '../../components/Turnstile.vue'
import AppleSegmentedControl from '../../components/AppleSegmentedControl.vue'
import ApplePasswordInput from '../../components/ApplePasswordInput.vue'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { getRouterPathWithLang } from '../../utils'

const props = defineProps({
    bindUserAddress: {
        type: Function,
        default: async () => { await api.bindUserAddress(); },
        required: true
    },
    newAddressPath: {
        type: Function,
        default: async (address_name, domain, cf_token, enableRandomSubdomain) => {
            return await api.fetch("/api/new_address", {
                method: "POST",
                body: JSON.stringify({
                    name: address_name,
                    domain: domain,
                    cf_token: cf_token,
                    enableRandomSubdomain: enableRandomSubdomain,
                }),
            });
        },
        required: true
    },
})

const message = useMessage()
const notification = useNotification()
const router = useRouter()

const {
    jwt, loading, openSettings,
    showAddressCredential, userSettings, addressPassword
} = useGlobalState()

const { locale, t } = useScopedI18n('views.common.Login')

const activeMode = ref(openSettings.value?.enableAddressPassword ? 'password' : 'credential') // 'password', 'credential', or 'register'
const credential = ref('')
const emailName = ref("")
const emailDomain = ref("")
const cfToken = ref("")
const enableRandomSubdomain = ref(false)
const loginCfToken = ref("")
const loginTurnstileRef = ref(null)
const loginAddress = ref('')
const loginPassword = ref('')

const showAddressPasswordOption = computed(() => {
    return Boolean(openSettings.value?.enableAddressPassword);
});

const showNewAddressOption = computed(() => {
    if (openSettings.value.disableAnonymousUserCreateEmail
        && !userSettings.value.user_email
    ) {
        return false;
    }
    if (userSettings.value.user_email && userSettings.value.can_create_address === false) {
        return false;
    }
    return openSettings.value.enableUserCreateEmail;
});

const segmentedOptions = computed(() => {
    const opts = [];
    if (showAddressPasswordOption.value) {
        opts.push({ value: 'password', label: t('passwordLogin') || '密码登录' });
    }
    opts.push({ value: 'credential', label: t('credentialLogin') || '凭据登录' });
    if (showNewAddressOption.value) {
        opts.push({ value: 'register', label: t('getNewEmail') || '新建邮箱' });
    }
    return opts;
});

// 根据 openSettings 初始化登录方式
const initLoginMethod = () => {
    if (showAddressPasswordOption.value) {
        activeMode.value = 'password';
    } else {
        activeMode.value = 'credential';
    }
}

const loginAndBindTag = computed(() => {
    if (userSettings.value.user_email) {
        return t('loginAndBind')
    }
    return t('login')
})

const login = async () => {
    if (activeMode.value === 'password') {
        if (!loginAddress.value || !loginPassword.value) {
            message.error(t('emailPasswordRequired'));
            return;
        }
        try {
            const res = await api.fetch('/api/address_login', {
                method: 'POST',
                body: JSON.stringify({
                    email: loginAddress.value,
                    password: loginPassword.value,
                    password_format: 'plain',
                    cf_token: loginCfToken.value
                })
            });
            jwt.value = res.jwt;
            await api.getSettings();
            try {
                await props.bindUserAddress();
            } catch (error) {
                message.error(`${t('bindUserAddressError')}: ${error.message}`);
            }
            await router.push(getRouterPathWithLang("/", locale.value));
        } catch (error) {
            message.error(error.message || "error");
            loginTurnstileRef.value?.refresh?.();
        }
        return;
    }
    if (!credential.value) {
        message.error(t('credentialInput'));
        return;
    }
    try {
        await api.fetch('/open_api/credential_login', {
            method: 'POST',
            body: JSON.stringify({
                credential: credential.value,
                cf_token: loginCfToken.value
            })
        });
        jwt.value = credential.value;
        await api.getSettings();
        try {
            await props.bindUserAddress();
        } catch (error) {
            message.error(`${t('bindUserAddressError')}: ${error.message}`);
        }
        await router.push(getRouterPathWithLang("/", locale.value));
    } catch (error) {
        message.error(error.message || "error");
        loginTurnstileRef.value?.refresh?.();
    }
}

const addressRegex = computed(() => {
    try {
        if (openSettings.value.addressRegex) {
            return new RegExp(openSettings.value.addressRegex, 'g');
        }
    } catch (error) {
        console.error(error);
        message.error(`Invalid addressRegex: ${openSettings.value.addressRegex}`);
    }
    return /[^a-z0-9]/g;
});

const generateNameLoading = ref(false);
const generateName = async () => {
    try {
        generateNameLoading.value = true;
        emailName.value = crypto.randomUUID()
            .replaceAll('-', '')
            .replace(addressRegex.value, '')
            .toLowerCase();
        if (emailName.value.length > openSettings.value.maxAddressLen) {
            emailName.value = emailName.value.slice(0, openSettings.value.maxAddressLen);
        }
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        generateNameLoading.value = false;
    }
};

const newEmail = async () => {
    try {
        const nameToSend = openSettings.value.disableCustomAddressName ? "" : emailName.value;
        const res = await props.newAddressPath(
            nameToSend,
            emailDomain.value,
            cfToken.value,
            enableRandomSubdomain.value
        );
        jwt.value = res["jwt"];
        addressPassword.value = res["password"] || '';
        await api.getSettings();
        await router.push(getRouterPathWithLang("/", locale.value));
        showAddressCredential.value = true;
        try {
            await props.bindUserAddress();
        } catch (error) {
            message.error(`${t('bindUserAddressError')}: ${error.message}`);
        }
    } catch (error) {
        message.error(error.message || "error");
    }
};

const addressPrefix = computed(() => {
    if (userSettings.value?.user_role) {
        return userSettings.value.user_role.prefix || "";
    }
    return openSettings.value.prefix;
});

const canUseRandomSubdomain = computed(() => {
    if (!emailDomain.value) {
        return false;
    }
    return (openSettings.value.randomSubdomainDomains || []).includes(emailDomain.value);
});

watch(canUseRandomSubdomain, (enabled) => {
    if (!enabled) {
        enableRandomSubdomain.value = false;
    }
});

const domainsOptions = computed(() => {
    if (userSettings.value.user_role) {
        const allDomains = userSettings.value.user_role.domains;
        if (!allDomains) return openSettings.value.domains;
        return openSettings.value.domains.filter((domain) => {
            return allDomains.includes(domain.value);
        });
    }
    if (!openSettings.value.defaultDomains) {
        return openSettings.value.domains;
    }
    return openSettings.value.domains.filter((domain) => {
        return openSettings.value.defaultDomains.includes(domain.value);
    });
});

watch(showNewAddressOption, (visible) => {
    if (!visible && activeMode.value === 'register') {
        activeMode.value = showAddressPasswordOption.value ? 'password' : 'credential';
    }
});

watch(showAddressPasswordOption, (visible) => {
    if (!visible && activeMode.value === 'password') {
        activeMode.value = 'credential';
    } else if (visible && activeMode.value === 'credential') {
        activeMode.value = 'password';
    }
}, { immediate: true });

onMounted(async () => {
    if (!openSettings.value.fetched) {
        await api.getOpenSettings(message, notification);
    }
    emailDomain.value = domainsOptions.value ? domainsOptions.value[0]?.value : "";
    initLoginMethod();
});
</script>

<template>
    <div class="mailbox-login-container">
        <AppleSegmentedControl
            v-if="segmentedOptions.length > 1"
            v-model="activeMode"
            :options="segmentedOptions"
            :aria-label="t('mailboxAccess') || '邮箱访问'"
        />

        <form v-if="activeMode === 'password' && showAddressPasswordOption" class="auth-form" @submit.prevent="login">
            <div class="auth-field">
                <label class="auth-label" for="mailbox-login-email">{{ t('email') }}</label>
                <input id="mailbox-login-email" v-model="loginAddress" class="auth-input" type="text"
                    autocomplete="username" placeholder="name@domain.com" />
            </div>
            <div class="auth-field">
                <label class="auth-label" for="mailbox-login-password">{{ t('password') }}</label>
                <ApplePasswordInput id="mailbox-login-password" v-model="loginPassword"
                    autocomplete="current-password" />
            </div>

            <Turnstile ref="loginTurnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="loginCfToken" />

            <button class="auth-submit-btn" type="submit" :disabled="loading">
                {{ loginAndBindTag }}
            </button>
        </form>

        <form v-else-if="activeMode === 'credential'" class="auth-form" @submit.prevent="login">
            <div class="auth-field">
                <label class="auth-label" for="mailbox-login-credential">{{ t('credential') }}</label>
                <textarea id="mailbox-login-credential" v-model="credential" class="auth-input"
                    :placeholder="t('credentialInput') || '请输入已保存的邮箱地址凭据'" rows="3"></textarea>
            </div>

            <Turnstile ref="loginTurnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="loginCfToken" />

            <button class="auth-submit-btn" type="submit" :disabled="loading">
                {{ loginAndBindTag }}
            </button>
        </form>

        <form v-else-if="activeMode === 'register' && showNewAddressOption" class="auth-form" @submit.prevent="newEmail">
            <div class="auth-field">
                <label class="auth-label">{{ t('email') }}</label>
                <div class="register-input-group">
                    <span v-if="addressPrefix" class="prefix-tag">{{ addressPrefix }}</span>
                    <input v-if="!openSettings.disableCustomAddressName" v-model="emailName" class="auth-input"
                        placeholder="name" style="flex: 1;" />
                    <input v-else :value="t('autoGeneratedName')" disabled class="auth-input" style="flex: 1;" />
                    <span class="at-tag">@</span>
                    <select v-model="emailDomain" class="auth-input domain-select">
                        <option v-for="d in domainsOptions" :key="d.value" :value="d.value">
                            {{ d.label || d.value }}
                        </option>
                    </select>
                </div>
            </div>

            <div v-if="!openSettings.disableCustomAddressName" class="auth-aux-row">
                <button type="button" class="auth-aux-link" :disabled="generateNameLoading" @click="generateName">
                    🎲 {{ t('generateName') }}
                </button>
            </div>

            <div v-if="canUseRandomSubdomain" class="random-subdomain-row">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                    <input type="checkbox" v-model="enableRandomSubdomain" />
                    <span>{{ t('enableRandomSubdomain') }}</span>
                </label>
            </div>

            <Turnstile v-model:value="cfToken" />

            <button class="auth-submit-btn" type="submit" :disabled="loading">
                {{ t('getNewEmail') }}
            </button>
        </form>
    </div>
</template>

<style scoped>
.mailbox-login-container {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.register-input-group {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
}

.prefix-tag,
.at-tag {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--ets-text-muted);
}

.domain-select {
    width: auto;
    min-width: 130px;
    cursor: pointer;
}

.random-subdomain-row {
    margin-top: 4px;
    color: var(--ets-text-muted);
}
</style>
