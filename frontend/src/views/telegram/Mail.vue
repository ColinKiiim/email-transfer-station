<script setup>
import { useRoute } from 'vue-router'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { processItem, revokeMailObjectUrls } from '../../utils/email-parser'
import MailContentRenderer from '../../components/MailContentRenderer.vue'

const { telegramApp, loading } = useGlobalState()
const route = useRoute()

const curMail = ref({});

watch(telegramApp, async () => {
    if (telegramApp.value.initData) {
        const nextMail = await fetchMailData();
        revokeMailObjectUrls(curMail.value);
        curMail.value = nextMail;
    }
});

const fetchMailData = async () => {
    try {
        const res = await api.fetch(`/telegram/get_mail`, {
            method: 'POST',
            body: JSON.stringify({
                initData: telegramApp.value.initData,
                mailId: route.query.mail_id
            })
        });
        loading.value = true;
        return await processItem(res);
    }
    catch (error) {
        console.error(error);
        return {};
    }
    finally {
        loading.value = false;
    }
};

onMounted(async () => {
    curMail.value = await fetchMailData();
});

onBeforeUnmount(() => revokeMailObjectUrls(curMail.value));
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded v-if="curMail.message" style="max-width: 800px; height: 100%;">
            <MailContentRenderer :mail="curMail" :showEMailTo="true" :showReply="false" />
        </n-card>
    </div>
</template>


<style scoped>
.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
    height: 80vh;
}
</style>
