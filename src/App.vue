<template>
  <div class="flex flex-col h-full">
    <div>
      <TopBar/>
    </div>
    <AccountsList class="flex-grow-0 overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-600 scrollbar-thumb-rounded-full"/>
  </div>
</template>

<script setup>
import './assets/tailwind.css';
import 'material-design-icons-iconfont/dist/material-design-icons.css';
import TopBar from './components/TopBar.vue';
import AccountsList from './components/AccountsList.vue';

</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
}
</style>