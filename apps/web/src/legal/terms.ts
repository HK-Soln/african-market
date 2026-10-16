import type { LegalTexts } from './types';

// DRAFT for legal review (F0-16). It states how the platform works (product rules in CLAUDE.md);
// [bracketed] parts and the liability section are for a lawyer to write. When the reviewed text
// replaces this, change LEGAL_VERSIONS.terms in @am/contracts.

export const TERMS: LegalTexts = {
  en: {
    title: 'Terms',
    intro:
      'These terms are the agreement between you and African Market when you use africanmarket.ae and its apps. By creating an account you accept them, together with our privacy policy.',
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [
          'African Market is run by [legal name of the company], trade licence [number], [registered address].',
        ],
      },
      {
        heading: 'What African Market is',
        paragraphs: [
          'A marketplace that helps people in the UAE find African shops near them and contact them, chat with them, or order from them.',
          'Shops are independent businesses. Each shop is responsible for what it lists, its prices, and for delivering what it sells; African Market is not the seller.',
        ],
      },
      {
        heading: 'Your account',
        paragraphs: [
          'Give accurate details and keep your one-time codes and password to yourself. You are responsible for what happens in your account.',
          'One account is for one person. You must be [18] or older.',
          'You can delete your account at any time from your account page.',
        ],
      },
      {
        heading: 'Selling on African Market',
        paragraphs: [
          'Every seller is verified before their shop appears. Taking payments online also needs a valid UAE trade licence checked by our team, and a payment account with Stripe.',
          'Listings must be accurate and lawful in the UAE. Sellers deliver orders themselves, in the areas they say they serve.',
        ],
      },
      {
        heading: 'Orders and payments',
        paragraphs: [
          'When a shop accepts online payment, you pay the shop directly through Stripe: the shop is the seller and receives the money. African Market charges the shop a commission. Cash on delivery is paid to the shop.',
          'Questions about an order, a refund or a delivery go first to the shop. [Dispute and refund terms to be completed before checkout opens.]',
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: [
          'Do not use the service to break the law, mislead or defraud anyone, harass people, send spam, or collect other people’s data. Do not interfere with how the service works.',
        ],
      },
      {
        heading: 'What you post',
        paragraphs: [
          'You keep the rights to the photos and text you post. You allow us to show them on the service for as long as they are published.',
        ],
      },
      {
        heading: 'Suspension',
        paragraphs: [
          'We may suspend or close an account or a shop that breaks these terms, and we will tell you why unless the law prevents us.',
        ],
      },
      {
        heading: 'Liability',
        paragraphs: ['[To be written by counsel.]'],
      },
      {
        heading: 'Law',
        paragraphs: [
          'These terms are governed by the laws of the United Arab Emirates. Disputes go to the courts of [emirate].',
        ],
      },
      {
        heading: 'Changes',
        paragraphs: [
          'When these terms change we publish the new version here with its date, and ask you to accept important changes before you continue.',
        ],
      },
    ],
  },
  ar: {
    title: 'الشروط',
    intro:
      'هذه الشروط هي الاتفاق بينك وبين أفريكان ماركت عند استخدامك africanmarket.ae وتطبيقاته. بإنشائك حسابًا فإنك توافق عليها، وعلى سياسة الخصوصية الخاصة بنا.',
    sections: [
      {
        heading: 'من نحن',
        paragraphs: [
          'تدير أفريكان ماركت شركة [الاسم القانوني للشركة]، رخصة تجارية [الرقم]، [العنوان المسجل].',
        ],
      },
      {
        heading: 'ما هو أفريكان ماركت',
        paragraphs: [
          'سوق إلكتروني يساعد المقيمين في الإمارات على إيجاد المتاجر الأفريقية القريبة منهم والتواصل معها، أو مراسلتها، أو الطلب منها.',
          'المتاجر أعمال مستقلة. كل متجر مسؤول عمّا يعرضه وعن أسعاره وعن توصيل ما يبيعه؛ وأفريكان ماركت ليس البائع.',
        ],
      },
      {
        heading: 'حسابك',
        paragraphs: [
          'قدّم بيانات صحيحة، واحتفظ برموزك لمرة واحدة وكلمة مرورك لنفسك. أنت مسؤول عمّا يحدث في حسابك.',
          'الحساب الواحد لشخص واحد. يجب أن يكون عمرك [18] عامًا أو أكثر.',
          'يمكنك حذف حسابك في أي وقت من صفحة حسابك.',
        ],
      },
      {
        heading: 'البيع على أفريكان ماركت',
        paragraphs: [
          'يُتحقق من كل بائع قبل ظهور متجره. ويتطلب قبول المدفوعات عبر الإنترنت أيضًا رخصة تجارية إماراتية سارية يتحقق منها فريقنا، وحساب دفع لدى Stripe.',
          'يجب أن تكون المعروضات صحيحة وقانونية في الإمارات. يتولى البائعون توصيل الطلبات بأنفسهم، في المناطق التي يذكرون أنهم يخدمونها.',
        ],
      },
      {
        heading: 'الطلبات والمدفوعات',
        paragraphs: [
          'عندما يقبل المتجر الدفع عبر الإنترنت، فإنك تدفع للمتجر مباشرةً عبر Stripe: المتجر هو البائع ويتلقى المال. ويتقاضى أفريكان ماركت عمولة من المتجر. أما الدفع عند الاستلام فيُدفع للمتجر.',
          'توجَّه الأسئلة عن الطلب أو الاسترداد أو التوصيل إلى المتجر أولًا. [تُستكمل شروط النزاعات والاسترداد قبل إطلاق الدفع الإلكتروني.]',
        ],
      },
      {
        heading: 'الاستخدام المقبول',
        paragraphs: [
          'لا تستخدم الخدمة لمخالفة القانون أو تضليل أي شخص أو الاحتيال عليه أو مضايقة الآخرين أو إرسال رسائل مزعجة أو جمع بيانات الآخرين. ولا تتدخل في طريقة عمل الخدمة.',
        ],
      },
      {
        heading: 'ما تنشره',
        paragraphs: [
          'تحتفظ بحقوق الصور والنصوص التي تنشرها، وتسمح لنا بعرضها على الخدمة طوال مدة نشرها.',
        ],
      },
      {
        heading: 'الإيقاف',
        paragraphs: [
          'يجوز لنا إيقاف أو إغلاق أي حساب أو متجر يخالف هذه الشروط، وسنخبرك بالسبب ما لم يمنعنا القانون من ذلك.',
        ],
      },
      {
        heading: 'المسؤولية',
        paragraphs: ['[يصوغها المستشار القانوني.]'],
      },
      {
        heading: 'القانون',
        paragraphs: [
          'تخضع هذه الشروط لقوانين دولة الإمارات العربية المتحدة، وتختص محاكم [الإمارة] بالنظر في النزاعات.',
        ],
      },
      {
        heading: 'التغييرات',
        paragraphs: [
          'عندما تتغير هذه الشروط ننشر النسخة الجديدة هنا مع تاريخها، ونطلب منك الموافقة على التغييرات المهمة قبل المتابعة.',
        ],
      },
    ],
  },
};
