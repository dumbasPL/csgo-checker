<template>
  <div class="w-full flex items-center justify-between p-2 bg-primary-500 shadow fixed z-10">
    <div class="text-white text-lg text pl-4">
      CS:GO account checker
    </div>

    <span class="w-1/3 h-10 border border-gray-400 text-sm rounded-full flex">
      <input type="search" placeholder="Search" class="flex-grow rounded-full px-4 focus:outline-none">
    </span>

    <div class="flex items-center text-white pr-2 space-x-4 select-none">
      <button class="material-icons">add</button>
      <button class="flex items-center group">
        <span class="material-icons">menu</span>
        <div class="flex flex-col bg-blue fixed text-white bg-slate-700 group-focus:shadow-lg shadow-black/50 opacity-0 group-focus:opacity-100
          rounded-bl-2xl top-14 right-0 origin-top translate-x-full group-focus:translate-x-0 transition ease-in duration-200 overflow-hidden">

          <TopBarMenuButton icon="file_download" text="Import" />
          <TopBarMenuButton icon="file_upload" text="Export" />
          <TopBarMenuButton icon="refresh" text="Refresh all" />
          <TopBarMenuButton icon="settings" text="Settings" @click="$refs.settingsModal.show()" />

        </div>
      </button>
    </div>

  </div>
  <div class="w-full bg-blue-300 h-14">
    <!-- header padding -->
  </div>
  <SettingsModal ref="settingsModal"/>
</template>

<script setup>
import TopBarMenuButton from './TopBarMenuButton.vue';
import SettingsModal from './SettingsModal.vue';

</script>