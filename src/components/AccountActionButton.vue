<template>
  <button class="w-full items-center flex px-3 py-1 text-lg hover:bg-slate-600 duration-300 hover:duration-150" @mousedown="$emit('click')">
    <span class="material-icons pr-3 w-8">{{icon}}</span>
    <span class="whitespace-nowrap">{{text}}</span>
  </button>
</template>

<script setup>
defineProps({
  icon: String,
  text: String,
});

defineEmits(['click']);
</script>