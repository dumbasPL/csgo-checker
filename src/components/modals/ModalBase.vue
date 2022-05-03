<template>
  <Teleport to="#modals" :disabled="!shown">
    <Transition name="modal">
      <div v-if="shown" class="fixed inset-0 flex items-center justify-center bg-black/70 bg-blend-darken" @click="hide">
        <div class="absolute w-3/4 h-5/6 modal">
      
          <div class="w-full max-h-full opacity-100 bg-slate-700 text-white rounded-lg shadow-2xl shadow-slate-900/40" @click.stop>
            <div class="py-3 px-4 flex items-center justify-between text-lg">
              <span class="truncate"><slot name="header"></slot></span>
              <button class="material-icons" @click="hide">close</button>
            </div>
            <div class="p-3">
              <slot></slot>
            </div>
            <div class="py-3 px-4 flex items-center justify-end">
              <slot name="footer">
                <SaveButton></SaveButton>
              </slot>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue';
import SaveButton from '../buttons/SaveButton.vue';

const shown = ref(false);

function show() {
  shown.value = true;
}

function hide() {
  shown.value = false;
}

defineExpose({show, hide});

</script>

<style>
.modal-enter-active, .modal-leave-active {
  --animation-time: 0.3s;
  transition: opacity var( --animation-time) ease-out;
}

.modal-enter-from, .modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal, .modal-leave-active .modal {
  transition: transform var( --animation-time) ease-out;
}

.modal-enter-from .modal, .modal-leave-to .modal {
  transform: translateY(-4rem);
}
</style>