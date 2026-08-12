<script setup>
import { ref, onMounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { useRoute, useRouter } from 'vue-router';

import { useGlobalState } from '../../store'
import { api } from '../../api';
import { consumeOAuthAttempt } from '../../security/oauth-state';
import { getRouterPathWithLang } from '../../utils';

const { userJwt } = useGlobalState()

const message = useMessage();
const route = useRoute()
const router = useRouter()
const errorInfo = ref('')
const resultStatus = ref('info')
const { t, locale } = useScopedI18n('views.user.UserOauth2Callback')

const fail = (error) => {
    resultStatus.value = 'error'
    errorInfo.value = error
    message.error(error)
}

const backToLogin = () => router.replace(getRouterPathWithLang('/user', locale.value))

onMounted(async () => {
    try {
        const state = route.query.state;
        let attempt;
        try {
            attempt = consumeOAuthAttempt(state);
        } catch {
            fail(t('stateNotMatch'));
            return;
        }
        const code = route.query.code;
        if (!code) {
            console.error('code not found');
            fail(t('codeNotFound'));
            return;
        }
        const res = await api.fetch(`/user_api/oauth2/callback`, {
            method: 'POST',
            body: JSON.stringify({
                code: code,
                clientID: attempt.clientID
            })
        });
        userJwt.value = res.jwt;
        resultStatus.value = 'success'
        await router.replace(getRouterPathWithLang('/user', locale.value));
    } catch (error) {
        console.error(error);
        fail(error.message || t('loginFailed'));
    }
});
</script>

<template>
    <n-card :bordered="false" embedded>
        <n-result
            :status="resultStatus"
            :title="resultStatus === 'error' ? t('loginFailed') : resultStatus === 'success' ? t('success') : t('logging')"
            :description="errorInfo"
        >
            <template v-if="resultStatus === 'error'" #footer>
                <n-button type="primary" @click="backToLogin">{{ t('backToLogin') }}</n-button>
            </template>
        </n-result>
    </n-card>
</template>
