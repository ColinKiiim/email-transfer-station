<script setup>
import { useGlobalState } from '../../store'
const { announcement } = useGlobalState()
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded>
            <div v-html="announcement"></div>
            <h2>Email Transfer Station</h2>
            <p>Private mailbox transfer and token-based inbox sharing.</p>
        </n-card>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    justify-content: center;
}

.n-card {
    max-width: 800px;
}

p {
    margin: 0;
    color: var(--n-text-color-2);
}
</style>
