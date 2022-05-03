<template>
  <th :class="{'cursor-pointer': sortable, 'w-[1%]': small}" 
    class="select-none sticky top-0 bg-slate-900 shadow-[inset_0_-1px_var(--tw-shadow-color)] shadow-primary-500 whitespace-nowrap" @click="sort">
    <span class="inline-flex align-bottom">
      <slot>{{name}}</slot>
      <span v-if="sortable && sorted" class="material-icons">{{ascending ? 'arrow_drop_up' : 'arrow_drop_down'}}</span>
    </span>
  </th>
</template>

<script setup>import { computed } from 'vue';

const emit = defineEmits(['sort']);

const props = defineProps({
  name: String,
  sortable: Boolean,
  sortedBy: String,
  ascending: Boolean,
  small: Boolean,
});

const sorted = computed(() => props.sortedBy == props.name);

function sort() {
  if (!props.sortable) {
    return;
  }

  // remove sorting if we aare at the last stage
  if (sorted.value && props.ascending) {
    return emit('sort', {
      name: null,
      ascending: false,
    });
  }

  emit('sort', {
    name: props.name,
    ascending: sorted.value, // start of as non-ascending and set to ascending on second click
  })
}

</script>