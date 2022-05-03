<template>
  <tr class="py-1 border-b border-slate-800">
    <td class="px-2">{{username}}</td>
    <td>{{account.name}}</td>
    <td>{{account.tags}}</td>
    <td class="text-center">{{account.lvl}}</td>
    <td><PrimeIcon class="h-6" :class="account.prime ? 'text-green-600' : 'text-red-600'"/></td>
    <td><RankIcon class="h-6" type="competitive" :group="0"/></td>
    <td><RankIcon class="h-6" type="wingman" :group="0"/></td>
    <td><RankIcon class="h-6" type="dangerzone" :group="0"/></td>
    <td class="px-2">{{account.error ? account.error : account.penalty_reason ? account.penalty_reason : '-'}}</td>
    <td class="p-0 whitespace-nowrap">
      <button v-for="({icon, classes, callback}, name) in actions" :key="name" :class="classes" @click="callback">
        <div class="material-icons align-middle">{{icon}}</div>
      </button>
      <button ref="menuButton" class="pr-3" @focus="showMenu" @blur="menuShown = false">
        <div class="material-icons align-middle">more_horiz</div>
      </button>
      <transition appear
        enter-from-class="transform scale-0 scale-0"
        enter-active-class="duration-300 ease-out"
        leave-to-class="transform opacity-0 scale-0"
        leave-active-class="duration-200 ease-in"
      >
        <div v-if="menuShown" class="relative top-0 buttom-0">
          <div class="bg-slate-700 shadow-lg shadow-black/50 absolute right-3 rounded-2xl overflow-hidden py-2"
            :class="menuDown ? '-top-6' : 'bottom-1'">
            <AccountActionButton v-for="({icon, text, classes, callback}, name) in actions" 
              :key="name" :icon="icon" :text="text" :class="classes" @click="callback" />
          </div>
        </div>
      </transition>
    </td>
  </tr>
</template>

<script setup>
import { ref } from 'vue';
import PrimeIcon from './icons/PrimeIcon.vue';
import RankIcon from './icons/RankIcon.vue';
import AccountActionButton from './buttons/AccountActionButton.vue';

const props = defineProps({
  username: String,
  account: Object
});

const actions = {
  'copy_friend_code': {
    icon: 'group', 
    text: 'Copy friend code',
    available() {
      return !!props.account.steamid;
    },
    callback() {
      clipboard.writeText(friendCode.encode(props.account.steamid))
    }
  },
  'copy_password': {
    icon: 'password',
    text: 'Copy password',
    available() {
      return !!props.account.password;
    },
    callback() {
      clipboard.writeText(props.account.password)
    }
  },
  'copy_otp': {
    icon: 'lock_clock', 
    text: 'Copy OTP',
    available() {
      return !!props.account.sharedSecret;
    },
    callback() {
      console.log(`TODO(copy_otp) -> ${props.account.sharedSecret}`);
    }
  },
  'open_profile': {
    icon: 'open_in_browser', 
    text: 'Open steam profile',
    available() {
      return !!props.account.steamid;
    },
    callback() {
      shell.openExternal('https://steamcommunity.com/profiles/' + props.account.steamid);
    }
  },
  'refresh_account': {
    icon: 'sync', 
    text: 'Refresh data',
    available() {
      return true;
    },
    callback() {
      console.log('TODO(refresh_account)');
    }
  },
  'edit_account': {
    icon: 'manage_accounts', 
    text: 'Edit account',
    available() {
      return true;
    },
    callback() {
      console.log('TODO(edit_account)');
    }
  },
  'delete_account': {
    icon: 'delete',
    text: 'Delete account',
    classes: 'text-red-400',
    available() {
      return true;
    },
    callback() {
      console.log('TODO(delete_account)');
    }
  }
}

const menuButton = ref();
const menuShown = ref(false);
const menuDown = ref(false);

function showMenu() {
  const rect = menuButton.value.getBoundingClientRect();

  // manu expanding down if it's on the top half of the screen
  menuDown.value = rect.top < (window.innerHeight / 2);
  menuShown.value = true;
}
</script>