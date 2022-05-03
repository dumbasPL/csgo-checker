<template>
  <img :src="`img/skillgroups/${type}_${group}.svg`" class="max-w-none align-top">
</template>

<script setup>

defineProps({
  type: {
    validator(value) {
      return ['competitive', 'wingman', 'dangerzone'].includes(value);
    }
  },
  group: [String, Number],
})

</script>