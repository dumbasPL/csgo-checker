<template>
  <ModalBase ref="modal">
    <template #header>Settings</template>
    xd
  </ModalBase>
</template>

<script setup>
import { ref } from 'vue';
import ModalBase from './ModalBase.vue';

const modal = ref(null);

function show() {
  modal.value.show();
}

defineExpose({show});

</script>