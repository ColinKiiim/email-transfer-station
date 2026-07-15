<script setup>
import { ref, onMounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { useRoute, useRouter } from 'vue-router';

import { useGlobalState } from '../../store'
import { api } from '../../api';
import { consumeOAuthAttempt } from '../../security/oauth-state';

const { userJwt } = useGlobalState()

const message = useMessage();
const route = useRoute()
const router = useRouter()
const errorInfo = ref('')
const { t } = useScopedI18n('views.user.UserOauth2Callback')

onMounted(async () => {
    try {
        const state = route.query.state;
        let attempt;
        try {
            attempt = consumeOAuthAttempt(state);
        } catch {
            message.error(t('stateNotMatch'));
            return;
        }
        const code = route.query.code;
        if (!code) {
            console.error('code not found');
            message.error(t('codeNotFound'));
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
        router.push('/user');
    } catch (error) {
        console.error(error);
        message.error(error.message || 'error');
    }
});
</script>

<template>
    <n-card :bordered="false" embedded>
        <n-result status="info" :title="t('logging')" :description="errorInfo">
        </n-result>
    </n-card>
</template>
